// TASKS.csv #2348 (review #2325, WA uranium) — Isocon on lab assays, one set of samples per group, an n per mean, missing immobiles named
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sharedImmobile, groupMeans, MIN_GROUP_N } from "../src/lib/isoconGroups.js";

const val = (a, s) => a[s] ?? null;
// multi-method data: Al on a few samples, Zr on others, U on all
const prec = [{ Al: 50000, Zr: 200, U: 10 }, { Al: 52000, U: 12 }, { Zr: 180, U: 30 }, { U: 40 }];
const alt = [{ Al: 45000, Zr: 150, U: 100 }, { Al: 44000, Zr: 140, U: 120 }, { U: 300 }];

test("the immobile elements both groups carry, and the ones a group lacks, named", () => {
  const r = sharedImmobile(prec, alt, ["Al", "Zr", "Ti"], val);
  assert.deepEqual(r.shared, ["Al", "Zr"]);
  assert.deepEqual(r.missing, [{ symbol: "Ti", group: "both" }]);
  assert.deepEqual(sharedImmobile([{ Al: 1 }], [{ Al: 1, Ti: 2 }], ["Ti"], val).missing, [{ symbol: "Ti", group: "precursor" }]);
});

test("means over the samples that carry every shared immobile element, each with its n", () => {
  const p = groupMeans(prec, ["Al", "Zr", "U"], val, ["Al", "Zr"]);
  assert.equal(p.n, 4); assert.equal(p.used, 1); // only the first precursor sample has both Al and Zr
  assert.deepEqual(p.values, { Al: 50000, Zr: 200, U: 10 }); assert.deepEqual(p.ns, { Al: 1, Zr: 1, U: 1 });
  const all = groupMeans(prec, ["Al", "Zr", "U"], val);
  assert.equal(all.used, 4); assert.deepEqual(all.ns, { Al: 2, Zr: 2, U: 4 }); assert.equal(all.values.U, 23);
  assert.equal(groupMeans([], ["U"], val), null);
  assert.equal(MIN_GROUP_N, 3);
});

test("the tool takes lab assays only and shows the samples behind each mean", () => {
  const t = readFileSync(new URL("../src/components/IsoconTool.jsx", import.meta.url), "utf8");
  assert.match(t, /const assays = useMemo\(\(\) => labAssays\(assaysIn\), \[assaysIn\]\), pxrfLeft = /);
  assert.match(t, /pXRF reading\(s\) left out: the grades here come from lab assays only\./);
  assert.match(t, /Only samples with every immobile element/);
  assert.match(t, /no value in the precursor group, left out of the immobile set\./);
  assert.match(t, />n \{r\.precursorN\}\{r\.precursorLt \?/ /* #2505: and its <DL count */);
  const x = readFileSync(new URL("../src/lib/analysisExports.js", import.meta.url), "utf8");
  assert.match(x, /precursor_n: r\.precursorN/);
});

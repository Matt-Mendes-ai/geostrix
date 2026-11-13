// TASKS.csv #3108 (split from #2915) — Thresholds (drill) offers the custom layers' code fields as populations, a field of more than 30
// codes as its 12 commonest and the rest as 'other', as Grade stats and Compositing do
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customDomainOptions, OTHER_CODES } from "../src/lib/customDomains.js";
import { drillDomainKeyFn, populations } from "../src/lib/thresholds.js";

// one hole, 400 m of a 'Material' field with 40 codes: M00 logged longest ... M39 shortest; Au 1 m samples
const rows = [];
let at = 0;
for (let c = 0; c < 40; c++) { const len = 40 - c; for (let k = 0; k < Math.ceil(len / 4); k++) { rows.push({ hole_id: "H1", from: at, to: at + 4, Material: `M${String(c).padStart(2, "0")}`, Note: `n${at}` }); at += 4; } }
const layer = { id: "L1", name: "Mat log", rows };
const assays = Array.from({ length: at }, (_, d) => ({ hole_id: "H1", from: d, to: d + 1, values: { Au: 0.01 + (d % 7) * 0.1 } }));

test("the field is offered grouped, and the populations are its 12 commonest codes and 'other'", () => {
  const opts = customDomainOptions([layer], null, { groupTop: 12 });
  const o = opts.find((x) => x.label === "Mat log · Material");
  assert.ok(o, "offered"); assert.deepEqual(o.grouped, { kept: 12, of: 40 });
  assert.equal(opts.some((x) => x.label === "Mat log · Note"), false, "free text is not a population");
  const keyOf = drillDomainKeyFn(o.key, { [o.key]: o.rows });
  const pops = populations(assays, { valueOf: (a) => a.values.Au, keyOf, weightOf: (a) => a.to - a.from });
  const keys = pops.map((p) => p.key).sort();
  assert.equal(keys.length, 13);
  assert.ok(keys.includes(OTHER_CODES));
  assert.deepEqual(keys.filter((k) => k !== OTHER_CODES), Array.from({ length: 12 }, (_, i) => `M${String(i).padStart(2, "0")}`));
  assert.equal(pops.reduce((s, p) => s + p.summary.n, 0), assays.length, "every sample in one population");
});

test("wiring: Thresholds adds the custom options to its drill populations", () => {
  const s = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(s, /\.\.\.customDomainOptions\(customLayers, \{ layers: projectLayers, labelOf: \(k\) => tr\(LAYER_META\[k\]\?\.label \|\| k\) \}, \{ groupTop: 12 \}\)/);
  assert.match(s, /const \{ collars = \[\], customLayers = \[\] \} = useStore\(\)/);
});

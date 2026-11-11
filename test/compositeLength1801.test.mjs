// TASKS.csv #1801 — Compositing opens on the commonest sample length (3 m on Kodiak), not a fixed 2 m, and says why
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commonestSampleLength } from "../src/lib/sampleLength.js";

test("the commonest length, QC and zero-length rows left out", () => {
  const rows = [];
  for (let i = 0; i < 68; i++) rows.push({ from: i * 3, to: i * 3 + 3 });
  for (let i = 0; i < 32; i++) rows.push({ from: 500 + i, to: 501 + i });
  rows.push({ from: 0, to: 0, sample_type: "STD" }, { from: 5, to: 7, sample_type: "DUP" });
  const r = commonestSampleLength(rows, (a) => !!a.sample_type);
  assert.deepEqual(r, { length: 3, share: 0.68, n: 100 });
  assert.equal(commonestSampleLength([]), null);
  assert.equal(commonestSampleLength([{ from: 0, to: 1.04 }, { from: 2, to: 2.96 }]).length, 1); // to the nearest 0.1 m
});

test("Compositing opens on it, with the reason under the box", () => {
  const c = readFileSync(new URL("../src/components/CompositingModal.jsx", import.meta.url), "utf8");
  assert.match(c, /const usual = useMemo\(\(\) => commonestSampleLength\(assays, \(a\) => classifyQAQCRow\(a\) !== "regular"\), \[assays\]\);/);
  assert.match(c, /const \[length, setLength\] = useState\(\(\) => usual\?\.length \|\| 2\);/);
  assert.match(c, /\{length\} m: the commonest sample length \(\{pct\} % of the samples\)/);
});

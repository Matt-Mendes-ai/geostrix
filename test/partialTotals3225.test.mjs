// TASKS.csv #3225 (review #3195, Galore Creek) — QAQC > Totals summed nine oxides without silica ('median 38.30 %') and still advised 'a sound
// sample totals about 100 less its LOI'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("without SiO2 or Al2O3 the sums are partial: said so, no tolerance boxes", () => {
  const s = readFileSync(new URL("../src/components/OxideTotalsTab.jsx", import.meta.url), "utf8");
  assert.match(s, /\[\["Si", "SiO2"\], \["Al", "Al2O3"\]\]\.filter\(\(\[sym\]\) => !majors\.some\(\(m\) => m\.symbol === sym\)\)/);
  assert.match(s, /partial \? tr\("\{missing\} not analysed: these are partial sums of \{list\}, not totals, and cannot be checked against 100 less the LOI\."/);
  assert.match(s, /\{!partial && <div style=\{\{ display: "flex", gap: 10/);
});

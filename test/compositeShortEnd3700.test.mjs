// TASKS.csv #3700 (3) (Fireweed rehearsal, round 3: Macpass) — 'Short end piece' counted 179 pieces dropped and 176 added where the table lost 171 and 168 rows: a piece with
// no assays was counted though it was never a row. The counts are now the rows (windows) the option removed, once across the elements.
import test from "node:test";
import assert from "node:assert/strict";
import { compositeSet } from "../src/lib/compositeSet.js";

const eu = { Zn: "%", Pb: "%" };
// 2 m composites. H1 is 0-9 m: windows 0-2, 2-4, 4-6, 6-8 and a 1 m end piece 8-9 that HAS Zn and Pb. H2 is 0-5 m with an end piece 4-5 that has only Pb.
// H3 is 0-5 m with an end piece 4-5 that has no assay at all (a gap: the sample stops at 4 m). H4 is 0-4 m: no end piece.
const row = (hole, from, to, v) => ({ hole_id: hole, from, to, values: v });
const A = [
  row("H1", 0, 9, { Zn: 1, Pb: 2 }),
  row("H2", 0, 4, { Zn: 1, Pb: 2 }), row("H2", 4, 5, { Pb: 3 }),
  row("H3", 0, 4, { Zn: 1, Pb: 2 }), row("H3", 4, 5, {}),
  row("H4", 0, 4, { Zn: 1, Pb: 2 }),
];
const opts = (shortEnd) => ({ length: 2, minCoverage: 0.5, shortEnd, minEnd: 1.5 });

test("#3700 'Drop': the count is the rows the table lost, a window with another element's data counted once, a piece with no assays not at all", () => {
  const keep = compositeSet(A, ["Zn", "Pb"], eu, opts("keep")), drop = compositeSet(A, ["Zn", "Pb"], eu, opts("drop"));
  const lost = keep.length - drop.length;
  assert.ok(lost > 0);
  assert.equal(drop.stats.shortEndsDropped, lost, `the table lost ${lost} rows`);
  // H1's piece (Zn and Pb) is one row, H2's (Pb only, so a row of the set though Zn has none) one row; H3's piece has no assays: not a row, not counted
  assert.equal(lost, 2);
  assert.equal(drop.stats.shortEndsMerged, 0);
});

test("#3700 'Add to the composite above': the same, in the pieces that would have been rows", () => {
  const keep = compositeSet(A, ["Zn", "Pb"], eu, opts("keep")), merge = compositeSet(A, ["Zn", "Pb"], eu, opts("merge"));
  assert.equal(merge.stats.shortEndsMerged, keep.length - merge.length);
  assert.equal(merge.stats.shortEndsMerged, 2);
  assert.equal(merge.stats.shortEndsDropped, 0);
});

test("#3700 'Keep' counts nothing; a single element is counted the same way", () => {
  const keep = compositeSet(A, ["Zn"], eu, opts("keep"));
  assert.equal(keep.stats.shortEndsDropped, 0); assert.equal(keep.stats.shortEndsMerged, 0);
  const d = compositeSet(A, ["Zn"], eu, opts("drop")), k = compositeSet(A, ["Zn"], eu, opts("keep"));
  assert.equal(d.stats.shortEndsDropped, k.length - d.length); // H1's only: H2's piece has no Zn
  assert.equal(d.stats.shortEndsDropped, 1);
});

// ---- (4) and (5): the kept composites layer
import { readFileSync } from "node:fs";
import { compositeLayerRows } from "../src/lib/compositeSet.js";
import { numericSourceChoices } from "../src/lib/numericSources.js";

const set = [0, 2, 4, 6].map((f, i) => ({ hole_id: "A", from: f, to: f + 2, avgGrade: i === 3 ? null : 3 + i, values: { Zn: i === 3 ? undefined : { grade: 3 + i, coverage: 1 }, Ag: { grade: 20 + i, coverage: 1 } }, density: 3.1 }));
test("#3700 (4) the windows the first element did not keep are left out of the layer, and the difference is what the message counts", () => {
  const rows = compositeLayerRows(set, ["Zn", "Ag"]);
  assert.equal(rows.length, 3);
  assert.equal(set.length - rows.length, 1); // CompositingModal says '1 composite(s) have no Zn grade (only another element's)'
  const s = readFileSync(new URL("../src/components/CompositingModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const left = results\.length - rows\.length;/);
  assert.match(s, /tr\("\{k\} composite\(s\) have no \{symbol\} grade \(only another element's\): they are in the table and the CSV, not in this layer\.", \{ k: left\.toLocaleString\(\), symbol \}\)/);
});

test("#3700 (5) a kept composites layer is listed once a field with its element's unit, not the value and the same element 'as logged'", () => {
  const rows = compositeLayerRows([0, 2, 4, 6].map((f, i) => ({ hole_id: "A", from: f, to: f + 2, avgGrade: 3 + i, values: { Zn: { grade: 3 + i, coverage: 1 }, Ag: { grade: 20 + i, coverage: 0.9 } }, density: 3.1 })), ["Zn", "Ag"]);
  const layer = { id: "custom_1", name: "Composites 2 m: Zn Ag", rows, unit: "%", fieldUnits: { Zn: "%", Ag: "ppm", coverage_Zn: "%", coverage_Ag: "%", density: "t/m³" }, valueField: "Zn" };
  const ch = numericSourceChoices({ customLayers: [layer] });
  const byField = Object.fromEntries(ch.map((c) => [c.field, c]));
  assert.ok(!ch.some((c) => c.field === "value"), "the value is the first element's field: listed once");
  assert.equal(byField.Zn.unit, "%"); assert.equal(byField.Ag.unit, "ppm"); assert.equal(byField.density.unit, "t/m³"); assert.equal(byField.coverage_Zn.unit, "%");
  assert.equal(byField.Zn.label, "Composites 2 m: Zn Ag › Zn");
  // an older kept layer (no fieldUnits) and any other numeric layer are listed as they were
  const old = numericSourceChoices({ customLayers: [{ ...layer, fieldUnits: undefined, valueField: undefined }] });
  assert.ok(old.some((c) => c.field === "value" && c.unit === "%"));
  assert.equal(old.find((c) => c.field === "Zn").unit, "as logged");
  const s = readFileSync(new URL("../src/components/CompositingModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /rows, unit: unit, notes, fieldUnits, valueField: symbol/);
});

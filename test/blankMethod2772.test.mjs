// TASKS.csv #2772 — an element joined from several method columns (#2328): QAQC Blanks can judge each blank against its own method's limit
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankRows, methodBlankLimits, methodDetectionLimits } from "../src/lib/qaqc.js";
import { qaqcBlankRows } from "../src/lib/analysisExports.js";

// U from the main column (DL 0.5 ppm) and, where it was over range or missing, from U_103 (DL 2 ppm)
const assays = [
  ...Array.from({ length: 6 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { U: 0.25 }, qualifiers: { U: "<" } })),
  ...Array.from({ length: 4 }, (_, i) => ({ hole_id: "H2", from: i, to: i + 1, values: { U: 1 }, qualifiers: { U: "<" }, valueSources: { U: "U_103" } })),
  { hole_id: "BLK-1", from: 0, to: 1, sample_type: "blank", values: { U: 2 } }, // main column: 2 ppm, over 5 x 0.5
  { hole_id: "BLK-2", from: 0, to: 1, sample_type: "blank", values: { U: 6 }, valueSources: { U: "U_103" } }, // U_103: 6 ppm, under 5 x 2
  { hole_id: "BLK-3", from: 0, to: 1, sample_type: "blank", values: { U: 11 }, valueSources: { U: "U_103" } }, // over 10
];
const units = { U: "ppm" };

test("methodBlankLimits: each method's limit times the multiple", () => {
  const ml = methodDetectionLimits(assays, "U");
  const m = methodBlankLimits(ml, 5);
  assert.equal(m.get(null), 2.5);
  assert.equal(m.get("U_103"), 10);
  assert.equal(methodBlankLimits([{ method: "X", limit: null }], 5).size, 0, "no limit, no entry");
});

test("blankRows: one limit judges a coarser method's blank as contaminated; per method it is not", () => {
  const one = blankRows(assays, "U", units, 2.5);
  assert.deepEqual(one.map((b) => b.flagged), [false, true, true]);
  assert.equal(one[0].method, undefined, "without methodLimits the rows are as before");
  const per = blankRows(assays, "U", units, 2.5, undefined, { methodLimits: methodBlankLimits(methodDetectionLimits(assays, "U"), 5) });
  assert.deepEqual(per.map((b) => [b.method, b.limit, b.flagged]), [[null, 2.5, false], ["U_103", 10, false], ["U_103", 10, true]]);
  // a method missing from the map falls back to the threshold
  const part = blankRows(assays, "U", units, 1, undefined, { methodLimits: new Map([["U_103", 10]]) });
  assert.deepEqual(part.map((b) => [b.limit, b.flagged]), [[1, true], [10, false], [10, true]]);
});

test("qaqcBlankRows: the method and its own limit in the export; unchanged without them", () => {
  const per = blankRows(assays, "U", units, 2.5, undefined, { methodLimits: new Map([[null, 2.5], ["U_103", 10]]) });
  assert.deepEqual(qaqcBlankRows(per, "U", 2.5)[1], { hole_id: "BLK-2", from: 0, to: 1, U: 6, method: "U_103", threshold: 10, flagged: false });
  assert.equal(qaqcBlankRows(per, "U", 2.5)[0].method, "main column");
  assert.deepEqual(Object.keys(qaqcBlankRows(blankRows(assays, "U", units, 2.5), "U", 2.5)[0]), ["hole_id", "from", "to", "U", "threshold", "flagged"]);
});

test("wiring: the Blanks tab offers the per-method judging only when the methods' limits differ", () => {
  const s = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /const methodsDiffer = methodLimits\.length > 1 && new Set\(methodLimits\.map\(\(m\) => m\.limit\)\)\.size > 1;/);
  assert.match(s, /blankRows\(assays, symbol, elementUnits, blankLimit, undefined, \{ methodLimits: blankByMethod \}\)/);
  assert.match(s, /\{methodsDiffer && \( \/\* TASKS\.csv #2772 \*\//);
  assert.match(s, /tr\("Judge each blank against its own method's limit: \{mult\} × \{list\}"/);
});

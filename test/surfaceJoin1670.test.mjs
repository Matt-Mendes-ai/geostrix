// TASKS.csv #1670 — a soil program's two files joined by sample ID in the surface-sample import.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { joinBySampleId, sampleIdKey } from "../src/lib/surfaceJoin.js";

test("ids match trimmed, case-blind, and '1234' = '1234.0'", () => {
  assert.equal(sampleIdKey(" k-0012 "), "K-0012");
  assert.equal(sampleIdKey(1234), "1234");
  assert.equal(sampleIdKey("1234.0"), "1234");
  assert.equal(sampleIdKey("1234.5"), "1234.5");
  assert.equal(sampleIdKey(null), "");
});

test("field sheet + assay sheet: columns added, shared ones fill blanks only, counts reported", () => {
  const field = { headers: ["Sample", "Horizon", "UTM_East"], idCol: "Sample", rows: [
    { Sample: "S1", Horizon: "B", UTM_East: 500100 }, { Sample: "s2", Horizon: "C", UTM_East: "" }, { Sample: "S3", Horizon: "B", UTM_East: 500300 }] };
  const assays = { headers: ["Sample Number", "UTM_East", "Cu_ppm", "Au_ppb"], idCol: "Sample Number", rows: [
    { "Sample Number": "S1", UTM_East: 999, Cu_ppm: 41, Au_ppb: 3 }, { "Sample Number": "S2", UTM_East: 500200, Cu_ppm: 88, Au_ppb: "<1" },
    { "Sample Number": "S2", UTM_East: 1, Cu_ppm: 0, Au_ppb: 0 }, { "Sample Number": "S9", UTM_East: 1, Cu_ppm: 5, Au_ppb: 1 }] };
  const j = joinBySampleId(field, assays);
  assert.deepEqual(j.headers, ["Sample", "Horizon", "UTM_East", "Cu_ppm", "Au_ppb"]);
  assert.deepEqual(j.added, ["Cu_ppm", "Au_ppb"]);
  assert.deepEqual(j.rows[0], { Sample: "S1", Horizon: "B", UTM_East: 500100, Cu_ppm: 41, Au_ppb: 3 }); // its own easting kept
  assert.deepEqual(j.rows[1], { Sample: "s2", Horizon: "C", UTM_East: 500200, Cu_ppm: 88, Au_ppb: "<1" }); // blank filled; first S2 row used
  assert.deepEqual(j.rows[2], { Sample: "S3", Horizon: "B", UTM_East: 500300 });
  assert.deepEqual([j.matched, j.baseOnly, j.addOnly, j.addDuplicates, j.filled], [2, 1, 1, 1, 1]);
});

test("column-view rows (a big file) come out as plain objects", () => {
  const cols = { id: ["A", "B"], v: [1, 2] };
  const view = (i) => new Proxy({}, { get: (_t, k) => cols[k]?.[i] });
  const j = joinBySampleId({ headers: ["id", "v"], rows: [view(0), view(1)], idCol: "id" }, { headers: ["id", "w"], rows: [{ id: "B", w: 7 }], idCol: "id" });
  assert.deepEqual(j.rows, [{ id: "A", v: 1 }, { id: "B", v: 2, w: 7 }]);
});

test("the surface dialog offers the join and keeps the dialog's choices", () => {
  const g = fs.readFileSync("src/modules/GeochemModule.jsx", "utf8");
  assert.match(g, /onJoinFile=\{joinSurfaceFile\}/);
  assert.match(g, /mapping: \{ \.\.\.mapping, \.\.\.Object\.fromEntries\(Object\.entries\(prev\.mapping\)\.filter\(\(\[, v\]\) => v\)\) \}/);
  assert.match(fs.readFileSync("src/components/SurfaceImportModal.jsx", "utf8"), /Add columns from another file \(by sample ID\)…/);
});

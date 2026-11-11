// TASKS.csv #2202 — intervals re-imported under another file name are counted under both files: the Files list says how many are shared,
// and removing one file says those are kept
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeAssayRows, assayFileSummary, removeAssayFile } from "../src/lib/geochem.js";

test("the review's case: 335 intervals in two files", () => {
  const a = Array.from({ length: 335 }, (_, i) => ({ hole_id: "WB", from: i, to: i + 1, values: { Au: 1 }, srcFile: "assays_1_wallaby.csv" }));
  const b = [...a.map((r) => ({ ...r, srcFile: "assays_1.csv" })), ...Array.from({ length: 387 }, (_, i) => ({ hole_id: "WX", from: i, to: i + 1, values: { Au: 1 }, srcFile: "assays_1.csv" }))];
  const merged = mergeAssayRows(a, b).rows;
  assert.equal(merged.length, 722);
  const files = Object.fromEntries(assayFileSummary(merged).map((f) => [f.file, f]));
  assert.deepEqual([files["assays_1.csv"].intervals, files["assays_1.csv"].shared], [722, 335]);
  assert.deepEqual([files["assays_1_wallaby.csv"].intervals, files["assays_1_wallaby.csv"].shared], [335, 335]);
  const r = removeAssayFile(merged, "assays_1.csv");
  assert.equal(r.removed, 387); assert.equal(r.keptShared, 335);
});

test("the list and the confirm say so", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /f\.shared \? tr\("\{n\} \(\{shared\} shared\)"/);
  assert.match(g, /tr\("Remove \{label\} \(\{intervals\} interval\(s\); \{shared\} that also came from another file are kept\)\?", \{ label, intervals: \(f\.intervals - f\.shared\)/);
});

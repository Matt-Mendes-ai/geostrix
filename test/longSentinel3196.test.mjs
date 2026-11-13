// TASKS.csv (Main, after #3196) — the long-format route read an all-nines value as the database's below-detection sign: -999 became '<999', a
// below-detection reading at 499.5. It is now a no-data code, as in a wide file (#3196): never chosen over a real result for the sample, and
// written through as -999 when it is the only one, so the wide import reads it as not assayed. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { pivotLongAssays, longAssayNote } from "../src/lib/longAssays.js";
import { isElementColumn, inferUnit, isAllNinesCode, readAssayCell } from "../src/lib/geochem.js";

const headers = ["hole_id", "from", "to", "sample_id", "analyte", "units", "concentration", "analysis_code"];
const row = (s, f, analyte, value, method = "ME-MS61") => ({ hole_id: "H1", from: f, to: f + 1, sample_id: s, analyte, units: "ppm", concentration: value, analysis_code: method });
const pivot = (rows) => pivotLongAssays(rows, headers, (sym) => inferUnit(sym, sym), (a) => isElementColumn(a));

test("all-nines codes, and only they", () => {
  for (const v of [-99, -999, -9999, -99.9]) assert.ok(isAllNinesCode(v), String(v));
  for (const v of [-0.005, -10, -100, -998, 999]) assert.ok(!isAllNinesCode(v), String(v));
});

test("-999 is not '<999': it is written through as a no-data code; a real negative is still below detection", () => {
  const pv = pivot([row("S1", 0, "Mo", -999), row("S1", 0, "Cu", 120), row("S2", 1, "Mo", -0.5), row("S2", 1, "Cu", -9999)]);
  assert.deepEqual(pv.rows.map((r) => [r.Mo_ppm, r.Cu_ppm]), [["-999", 120], ["<0.5", "-9999"]]);
  assert.equal(pv.report.noData, 2);
  assert.equal(pv.report.belowDetection, 1);
  assert.match(longAssayNote(pv.report), /2 result\(s\) are no-data codes \(-99 \/ -999 \/ -9999\): read as not assayed\./);
  // the wide import then reads the cell as not assayed (and a re-import clears an earlier value)
  assert.deepEqual(readAssayCell(pv.rows[0].Mo_ppm, "bdl", 40, null, 40), { value: null, qualifier: null, kind: "neg_missing" });
});

test("a no-data code never wins over a real result of the same sample", () => {
  const pv = pivot([row("S1", 0, "Mo", -999, "ME-MS61"), row("S1", 0, "Mo", 12.5, "ME-ICP61"), row("S2", 1, "Mo", 3.1, "ME-MS61"), row("S2", 1, "Mo", -999, "ME-ICP61")]);
  assert.deepEqual(pv.rows.map((r) => r.Mo_ppm), [12.5, 3.1]);
  assert.equal(pv.report.noData, 0);
  assert.equal(pv.report.conflicts, 0, "a no-data code is no second result");
});

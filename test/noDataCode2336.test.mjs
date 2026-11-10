// TASKS.csv #2336 (review #2325, WA uranium) — -100 in a P column of 100-500 ppm is "<100", not a no-data code; -99 / -999 / -9999 and codes
// bigger than the column's values still are; the dialog lists the codes it means
import test from "node:test";
import assert from "node:assert/strict";
import { isNoDataCode, readAssayCell } from "../src/lib/geochem.js";
import { columnNegatives, negativeSummary } from "../src/lib/assayColumnScan.js";

test("a code at or below -99 is no-data only when it is all nines or bigger than the column", () => {
  assert.equal(isNoDataCode(-100, 500), false); // P: -100 beside 100-500 ppm
  assert.equal(isNoDataCode(-99, 500), true);
  assert.equal(isNoDataCode(-999, 5000), true);
  assert.equal(isNoDataCode(-9999, 500), true);
  assert.equal(isNoDataCode(-1000, 500), true); // bigger than anything in the column
  assert.equal(isNoDataCode(-100, 0), true); // column unknown: the fixed threshold, as before
  assert.equal(isNoDataCode(-50, 500), false); // above -99: never a sentinel here
});

test("the cell reader: -100 in P is '<100' stored at 50", () => {
  assert.deepEqual(readAssayCell(-100, "bdl", 0, null, 500), { value: 50, qualifier: "<", kind: "neg_bdl" });
  assert.equal(readAssayCell(-9999, "bdl", 0, null, 500).kind, "neg_missing");
  assert.equal(readAssayCell(-100, "bdl", 0, null).kind, "neg_missing"); // no column maximum given: as before
  assert.equal(readAssayCell(-100, "missing", 0, null, 500).kind, "neg_missing"); // the user's "not assayed"
});

test("the dialog's counts and the codes it lists", () => {
  const stats = new Map([["P", { max: 500, negs: Array(20).fill(-100) }], ["U", { max: 25000, negs: [-9999, -9999, -0.5] }]]);
  assert.deepEqual([columnNegatives(stats.get("P")).codes, columnNegatives(stats.get("P")).sentinels], [20, 0]);
  const t = negativeSummary(stats, ["P", "U"]);
  assert.equal(t.codes, 21);
  assert.equal(t.sentinels, 2);
  assert.deepEqual(t.sentinelCols, ["U: -9999 ×2"]);
});

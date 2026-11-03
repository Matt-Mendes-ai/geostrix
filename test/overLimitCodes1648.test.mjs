// TASKS.csv #1648 (review #1645, Copley) — a negative code at a column's largest value is its upper limit, not "below detection"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAssayCell, isOverLimitCode, columnPositiveMax } from "../src/lib/geochem.js";

test("Copley: K -10 beside a 9.89 % maximum, Mn -10000 beside 9,447 ppm", () => {
  assert.deepEqual(readAssayCell("-10", "bdl", 9.89), { value: 10, qualifier: ">", kind: "neg_over" });
  assert.deepEqual(readAssayCell("-10000", "bdl", 9447), { value: 10000, qualifier: ">", kind: "neg_over" });
});

test("below-detection and no-data codes are unchanged", () => {
  assert.deepEqual(readAssayCell("-0.005", "bdl", 9.89), { value: 0.0025, qualifier: "<", kind: "neg_bdl" });
  assert.equal(readAssayCell("-9999", "bdl", 50).value, null, "far above the column (> 2x): no-data");
  assert.equal(readAssayCell("-10", "missing", 9.89).value, null, "the user said codes are not assayed");
  assert.equal(readAssayCell("-10").kind, "neg_bdl", "no column maximum given: as before");
  assert.equal(isOverLimitCode(-5, 9.89), false);
});

test("columnPositiveMax reads the column", () => {
  assert.equal(columnPositiveMax([{ K: "8.4" }, { K: "-10" }, { K: "<0.01" }, { K: "9.89" }], "K"), 9.89);
});

test("the dialog offers it and the import applies it per column", () => {
  const modal = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.ok(modal.includes("onChange({ ...modal, overLimitCodes: e.target.checked })"));
  const gm = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(gm.includes("const c = readAssayCell(raw, negativeMode, colMaxOf(header));"));
});

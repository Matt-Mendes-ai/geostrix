// TASKS.csv #2374 (review #2325, WA uranium) — the assay chips came in import order (U, the commodity with the most values, eighth of 63).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayValueCounts, orderAssayChips } from "../src/lib/viewer/assayChipOrder.js";

const rows = [
  { values: { U: 5, Co: 1, Ag: null } }, { values: { U: 3, Sc: 2 } }, { values: { U: 1, Sc: NaN } }, { values: { Fe: 2, U: 0 } }, {},
];
const els = ["Co", "Sc", "Ag", "Ba", "U", "Fe"].map((symbol) => ({ symbol }));

test("counts only finite values", () => {
  const n = assayValueCounts(rows);
  assert.equal(n.get("U"), 4); assert.equal(n.get("Sc"), 1); assert.equal(n.get("Co"), 1); assert.equal(n.get("Ag"), undefined);
});

test("most values first, ties alphabetical, the shown elements ahead in their own order", () => {
  const n = assayValueCounts(rows);
  assert.deepEqual(orderAssayChips(els, [], n).map((e) => e.symbol), ["U", "Co", "Fe", "Sc", "Ag", "Ba"]);
  assert.deepEqual(orderAssayChips(els, ["Fe", "Ba"], n).map((e) => e.symbol), ["Fe", "Ba", "U", "Co", "Sc", "Ag"]);
  assert.deepEqual(els.map((e) => e.symbol), ["Co", "Sc", "Ag", "Ba", "U", "Fe"], "the input is not reordered");
});

test("the 3D View's chip row uses it", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{orderAssayChips\(assayElements, assayDisplayElements, assayChipCounts\)\.map\(\(e\) => \{/);
  assert.match(v, /const assayChipCounts = useMemo\(\(\) => assayValueCounts\(assays\), \[assays\]\);/);
});

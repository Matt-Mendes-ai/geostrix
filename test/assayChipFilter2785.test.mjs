// TASKS.csv #2785 — the 3D View's assay chips get a filter box once a project has more than 20 elements; shown elements always stay.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { filterAssayChips, CHIP_FILTER_MIN } from "../src/lib/viewer/assayChipOrder.js";

const chips = ["U", "Th", "Au", "Cu", "Cs", "Ce", "Sc", "V"].map((symbol) => ({ symbol }));

test("the typed text matches the symbol anywhere, in any case; empty text keeps every chip", () => {
  assert.deepEqual(filterAssayChips(chips, "c", []).map((e) => e.symbol), ["Cu", "Cs", "Ce", "Sc"]);
  assert.deepEqual(filterAssayChips(chips, " AU ", []).map((e) => e.symbol), ["Au"]);
  assert.equal(filterAssayChips(chips, "", ["U"]), chips);
  assert.deepEqual(filterAssayChips(chips, "zz", []), []);
});

test("a shown element stays whatever is typed (so it can be switched off), in the order given", () => {
  assert.deepEqual(filterAssayChips(chips, "cu", ["U", "V"]).map((e) => e.symbol), ["U", "Cu", "V"]);
});

test("wiring: the box shows past 20 elements and filters the ordered chips", () => {
  assert.equal(CHIP_FILTER_MIN, 20);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{assayElements\.length > CHIP_FILTER_MIN && <input type="search" value=\{chipQ\} onChange=\{\(e\) => setChipQ\(e\.target\.value\)\} placeholder=\{tr\("Filter elements"\)\}/);
  assert.match(v, /filterAssayChips\(orderAssayChips\(assayElements, assayDisplayElements, assayChipCounts\), chipQ, assayDisplayElements\)\.map/);
});

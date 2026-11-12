// TASKS.csv #2425 (review #2325, WA uranium) — the two Grade tools answered 'model only these holes' differently: with Model area = 'Holes
// checked (18 of 430)', Estimation kept the whole-property grid and every hole's samples. Samples follow the Model area since #2544; the
// grid now fits the checked holes by default too, as the Grade shell's does (#2059).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");

test("the grid defaults to the checked holes under that Model area", () => {
  assert.match(g, /const areaChecked = modelArea === "checked" && checkedHoleIds\?\.size > 0 && collars\.some\(\(c\) => !checkedHoleIds\.has\(c\.hole_id\)\);/);
  assert.match(g, /keep\("gridMode", areaChecked \? "checked" : "data", \(g\) => !\(areaChecked && g === "data"\) &&/);
});

test("samples follow it too (#2544), with their own choice", () => {
  assert.match(g, /useState\(\(\) => \(modelArea === "checked" && checkedHoleIds\?\.size \? "checked" : "all"\)\)/);
  assert.match(g, /aria-label=\{tr\("Samples from"\)\}/);
});

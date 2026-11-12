// TASKS.csv #2667 — block model 'Values are': 'Susceptibility (×10⁻³ SI)', and 'A grade (element, unit)' so Grade-tonnage waits on a CSV
// model until it is said to be a grade
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGradeLabel } from "../src/lib/voxelProperty.js";
import { offersGradeTonnage } from "../src/lib/gradeTonnage.js";
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("#2667 an element and unit as typed", () => {
  assert.deepEqual(parseGradeLabel("Cu ppm"), { element: "Cu", unit: "ppm" });
  assert.deepEqual(parseGradeLabel("Au (g/t)"), { element: "Au", unit: "g/t" });
  assert.deepEqual(parseGradeLabel("Fe %"), { element: "Fe", unit: "%" });
  assert.deepEqual(parseGradeLabel("Li2O, %"), { element: "Li2O", unit: "%" });
  for (const t of ["Cu", "copper", "", null]) assert.equal(parseGradeLabel(t), null, String(t));
});

test("#2667 Grade-tonnage on a CSV model only once it is a grade", () => {
  const geo = () => false;
  assert.equal(offersGradeTonnage({ source: "csv" }, { geophysProperty: geo }), false);
  assert.equal(offersGradeTonnage({ source: "csv", params: { element: "Cu", unit: "ppm", declaredGrade: true } }, { geophysProperty: geo }), true);
  assert.equal(offersGradeTonnage({ source: "csv", property: "Cu ppm" }, { geophysProperty: geo }), true); // typed under Other…
  assert.equal(offersGradeTonnage({ source: "estimate-ok", params: { element: "Au" } }, { geophysProperty: geo }), true); // estimates unchanged
});

test("#2667 the Values are list", () => {
  assert.match(g, /"Susceptibility \(SI\)", "Susceptibility \(×10⁻³ SI\)"/);
  assert.match(g, /<option value="__grade">/);
  assert.match(g, /params: \{ \.\.\.\(model\.params \|\| \{\}\), element: g\.element, unit: g\.unit, declaredGrade: true \}/);
  assert.match(g, /value=\{model\.params\?\.declaredGrade && !model\.property \? "__grade"/);
});

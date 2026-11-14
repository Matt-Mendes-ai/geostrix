// TASKS.csv #2067 — an estimate's 'Values are' says its element and unit (params) instead of 'Not stated (the file names no unit)',
// without setting model.property (which would rename the estimate's export column, lib/blockModelExport.js)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("#2067 the estimate's element and unit label the 'Values are' choice", () => {
  assert.match(g, /<option value="">\{!model\.property && model\.params\?\.element && !model\.params\?\.declaredGrade \? \(model\.params\.unit \? tr\("\{el\} \(\{unit\}\), from the estimate", \{ el: model\.params\.element, unit: gradeUnitLabel\(model\.params\.element, model\.params\.unit\) \/\* #3286 \(3\) \*\/ \}\) : tr\("\{el\}, from the estimate", \{ el: model\.params\.element \}\)\) : tr\("Not stated \(the file names no unit\)"\)\}<\/option>/);
  // the value stays "" (no property set), so the export column keeps its name
  assert.doesNotMatch(g, /onUpdate\(model\.id, \{ property: model\.params/);
});

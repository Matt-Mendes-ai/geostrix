// TASKS.csv #3564 / #3694 (rehearsal round 3) — one density unit: t/m³ in Grade stats, the X-Y axes, the Grade shell list and the Estimation dialog (they read lib/numericSources.js, which said g/cc), as in the 3D View, the
// Data table, Compositing and Grade-tonnage; and the unit is readable where it is shown: the sidebar row's name has a tooltip with the full text, the Data table's column is as wide as its heading.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LOG_SOURCES } from "../src/lib/numericSources.js";
import { LAYER_META } from "../src/lib/layers.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the density layer has one unit in the numeric-source list and in the layer table", () => {
  assert.equal(LOG_SOURCES.sg.unit, "t/m³"); assert.equal(LAYER_META.sg.unit, "t/m³");
  for (const f of ["../src/lib/numericSources.js", "../src/components/GradeStatistics.jsx", "../src/modules/GeochemModule.jsx", "../src/components/GradeEstimationModal.jsx"]) assert.doesNotMatch(read(f), /Specific gravity[^\n]{0,30}g\/cc/, f);
});
test("the sidebar row's name carries a tooltip and the Data table's column follows its heading", () => {
  assert.match(read("../src/modules/viewer/ViewerParts.jsx"), /title=\{typeof label === "string" \? label : undefined/);
  const d = read("../src/components/DrillTableModal.jsx");
  assert.match(d, /const colWidth = \(c\) => Math\.max\(COL_W, Math\.min\(260, Math\.ceil\(String\(c\?\.label \|\| ""\)\.length \* 7 \+ 34\)\)\);/);
  assert.match(d, /\.\.\.cell, width: widths\[ci\]/);
});

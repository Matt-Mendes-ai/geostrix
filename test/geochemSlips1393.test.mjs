// TASKS.csv #1393 — six small slips in the Geochem tools (review #1352, Silvertip)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const g = read("../src/modules/GeochemModule.jsx");

test("1: no lone '.' when nothing was counted; no 'see it' for an empty layer", () => {
  assert.match(g, /tr\(countList \? " \{v\}\.\{v2\}\{v3\} Screening level: protolith assumed\." : "\{v2\}\{v3\} Screening level: protolith assumed\."/);
  assert.match(g, /notice\(runs\.length \? "Generated \{rows\} intervals[^"]*Switch to 3D View to see it\." : "No interval was generated from \{n\} samples, so the \{v\} layer is empty\.\{detail\}"/);
});

test("2: Including rounds like the grade column; the count column says what it counts", () => {
  const b = read("../src/components/BestIntercepts.jsx");
  assert.match(b, /\$\{\+h\.avgGrade\.toPrecision\(4\)\} \(/);
  assert.ok(b.includes('tr("Samples ≥ cutoff")') && !b.includes('{tr("Assay intervals")}'));
});

test("3: the log histogram's end labels in significant figures", () => {
  const s = read("../src/components/GradeStatistics.jsx");
  assert.match(s, /logScale \? \+Math\.pow\(10, data\.min\)\.toPrecision\(3\)/);
  assert.match(s, /logScale \? \+Math\.pow\(10, data\.max\)\.toPrecision\(3\)/);
});

test("4: colour by element in the element's own unit", () => {
  assert.match(g, /const colorUnit = \(colorEl && elementUnits\[colorEl\]\) \|\| "ppm";/);
  assert.ok(!g.includes('valueIn(a, colorEl, "ppm", elementUnits)') && !g.includes('valueIn(sample, colorEl, "ppm", elementUnits)'));
  assert.match(g, /tr\("\{unit\} \(\{v\}\)", \{ unit: colorUnit/);
});

test("5: 'Sampling medium' listed once", () => {
  assert.match(read("../src/components/SurfaceAnomalyControls.jsx"), /gOpts\.filter\(\(o\) => o\.value !== "medium" \|\| \(cfg\.mode === "element" && cfg\.scheme === "threshold"\)\)/);
});

test("6: no-terrain messages name the offline route", () => {
  assert.ok(read("../src/components/CatchmentsPanel.jsx").includes("build one offline from points or contours (Maps > Terrain > Terrain from points or contours…)"));
  assert.ok(read("../src/components/SurveyPlannerPanel.jsx").includes("build one offline from points or contours (Maps > Terrain)"));
});

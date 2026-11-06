// TASKS.csv #1537 — the level plan could colour holes only by logged intervals; the assay elements shown in 3D are choices now
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planAssayLayers, assayRamp, slabRuns, piercePoints } from "../src/lib/levelPlan.js";

// a vertical hole from 1500 m down to 1400 m, the plan at RL 1465 m with a ±5 m slab
const trace = [{ md: 0, x: 0, y: 0, z: 1500 }, { md: 100, x: 0, y: 0, z: 1400 }];
const hole = { hole_id: "H1", trace, runs: slabRuns(trace, 1460, 1470), pierce: piercePoints(trace, 1465) };
hole.pierce.forEach((pc) => { pc.logs = [{ label: "Lithology: AND", color: "#123456", layer: "litho" }]; });
const pt = (from, to, value, color = "#aaaaaa") => ({ hole_id: "H1", color, assay: { sym: "Au", value, from, to, u: "ppm" } });

test("an element with grade classes: its slab intervals and pierce point take the 3D colours, its classes are the legend", () => {
  const h = structuredClone(hole);
  const groups = [{ key: "assay_Au", label: "Au (ppm)", grade: true, items: [["≤ 0.5 ppm", "#0000ff"], ["> 0.5 ppm", "#ff0000"], ["below 0.01 ppm hidden", "transparent"]] }];
  const { intervals, legends } = planAssayLayers([pt(10, 20, 0.2, "#0000ff"), pt(30, 36, 4.1, "#ff0000"), pt(36, 50, 0.3, "#0000ff")], [h], groups, null);
  // only the samples inside the slab (md 30-40), clipped to it
  assert.deepEqual(intervals.map((iv) => [iv.layer, iv.label, iv.color]), [["assay:Au", "Au: 4.1 ppm", "#ff0000"], ["assay:Au", "Au: 0.3 ppm", "#0000ff"]]);
  assert.deepEqual(intervals[0].lines, [[[0, 0], [0, 0]]]);
  // the pierce point at md 35 sits in the 4.1 ppm sample; the litho log is kept
  assert.deepEqual(h.pierce[0].logs.map((l) => [l.layer, l.color]), [["litho", "#123456"], ["assay:Au", "#ff0000"]]);
  assert.deepEqual(legends["assay:Au"], { title: "Au (ppm)", items: [["≤ 0.5 ppm", "#0000ff"], ["> 0.5 ppm", "#ff0000"]] });
});

test("without grade classes: a ramp over the whole project's values, the same colour for the same grade at any RL", () => {
  const h = structuredClone(hole);
  const project = [0.005, 0.01, 0.02, 0.05, 0.1, 0.3, 1, 3, 10, 30];
  const groups = [{ key: "assay_Au", label: "Au (ppm)", grade: false, items: [["Au (sphere size = grade)", "#ffaa00"]] }];
  const { intervals, legends } = planAssayLayers([pt(30, 40, 3)], [h], groups, () => project);
  const r = assayRamp(project);
  assert.ok(r.log); // four decades: a log ramp
  assert.equal(intervals[0].color, r.color(3));
  assert.notEqual(r.color(0.01), r.color(3));
  assert.equal(legends["assay:Au"].items.length, 5);
  assert.match(legends["assay:Au"].items[0][0], /^≤ .* ppm$/);
  assert.match(legends["assay:Au"].items[4][0], /^≥ .* ppm$/);
  assert.equal(assayRamp([]), null);
  assert.equal(assayRamp([2, 2, 2]).color(2), assayRamp([2, 2, 2]).color(5)); // one value: no division by zero
});

test("the plan payload and window use it", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const pa = planAssayLayers\(points, holes, assayLegendGroups\(/);
  assert.match(v, /intervals: \[\.\.\.planIntervals, \.\.\.pa\.intervals\], assayLegends: pa\.legends/);
  const w = readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /const L = data\.assayLegends\?\.\[activeLayer\] \|\| planLegend\(/);
  assert.match(w, /filter\(\(l\) => !l\.layer\?\.startsWith\("assay:"\)\)/); // the tooltip lists a grade once
});

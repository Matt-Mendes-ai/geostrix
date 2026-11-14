// TASKS.csv #2259 (review #2174, WA gold) — the Layout's drill plan showed the drilled collars only: the planned holes are on it too,
// dashed in the planned colour, labelled '(planned)', with a key row; a tick turns them off; 'Fit the holes' frames them
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillPlanPlanned, holesToFit, plannedAsCollars, showsPlanned } from "../src/lib/drillPlan.js";

const el = { id: "dp", w: 600, h: 400, scale: 5000, centre: { x: 500000, y: 6000000 }, labels: "all", fontPt: 7 };
const collars = [{ hole_id: "DD01", x: 500000, y: 6000000, azimuth: 0, dip: -60, length: 100 }];
const planned = [{ id: "plan_1", name: "PLAN-1", x: 500050, y: 6000020, azimuth: 90, dip: -55, length: 150 }, { id: "plan_2", name: "PLAN-2", x: 520000, y: 6000000, azimuth: 0, dip: -60, length: 100 }];

test("planned holes in frame px, the far one left out; none when the tick is off", () => {
  const p = drillPlanPlanned(el, planned);
  assert.equal(p.length, 1); assert.equal(p[0].id, "PLAN-1"); assert.equal(p[0].planned, true);
  assert.ok(p[0].bx > p[0].ax, "an east-dipping trace runs right");
  assert.deepEqual(drillPlanPlanned({ ...el, showPlanned: false }, planned), []);
  assert.deepEqual(drillPlanPlanned(el, []), []);
  assert.equal(showsPlanned({}), true, "on by default");
  assert.equal(plannedAsCollars(planned)[0].hole_id, "PLAN-1");
  assert.equal(drillPlanPlanned({ ...el, holeFilter: "DD" }, planned).length, 0, "the hole filter reads the planned hole's name");
  assert.equal(holesToFit(el, collars, planned).length, 3); assert.equal(holesToFit({ showPlanned: false }, collars, planned).length, 1);
});

test("the drawing labels them '(planned)', keeps labels off their collars and adds a key row", () => {
  const e = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(e, /const planned = drillPlanPlanned\(el, plannedHoles\);/);
  assert.match(e, /\[\.\.\.g\.holes, \.\.\.planned\]\.filter\(\(hh\) => hh\.inside && [^\n]*hh\.planned \? tr\("\{name\} \(planned\)", \{ name: hh\.id \}\) : hh\.id/);
  assert.match(e, /const collarBoxes = \[\.\.\.g\.holes, \.\.\.planned\]\.filter/);
  assert.match(e, /const plannedKey = planned\.length \? \[\{ label: tr\("Planned hole"\) \}\] : \[\];/);
  assert.match(e, /const keyRows = colouring\.key\.length \+ shapeKey\.length \+ plannedKey\.length;/);
});

test("wiring: the element draws them dashed in the planned colour; Layout passes them on both render paths and offers the tick", () => {
  const e = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(e, /stroke=\{colors\.planned\} strokeWidth=\{line\} strokeDasharray=/);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /plannedHoles=\{ctx\?\.plannedHoles \|\| null\}/);
  assert.match(l, /<LayoutPrintRoot ref=\{printRootRef\} plannedHoles=\{plannedHoles\}/);
  assert.match(l, /fitDrillPlan\(holesToFit\(sel, tableCollars \|\| \[\], plannedHoles\)/);
  assert.match(l, /onChange=\{\(e\) => updateSelected\(\{ showPlanned: e\.target\.checked \}\)\}/);
});

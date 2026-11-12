// TASKS.csv #2686 — drill plan symbol shape by a collar field, beside the colour by grade
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillPlanShapes, symbolPath } from "../src/lib/drillPlan.js";

const collars = [
  ...Array.from({ length: 5 }, (_, i) => ({ hole_id: `AC${i}`, attrs: { hole_type: "AC" } })),
  ...Array.from({ length: 3 }, (_, i) => ({ hole_id: `DD${i}`, attrs: { hole_type: "DD" } })),
  ...Array.from({ length: 2 }, (_, i) => ({ hole_id: `RC${i}`, attrs: { hole_type: "RC" } })),
  { hole_id: "RAB1", attrs: { hole_type: "RAB" } },
  { hole_id: "X1", attrs: {} },
];

test("the three commonest values get shapes; the rest and the unrecorded share the circle, said once in the key", () => {
  const s = drillPlanShapes(collars, "hole_type");
  assert.equal(s.shapeOf("AC0"), "square");
  assert.equal(s.shapeOf("DD1"), "triangle");
  assert.equal(s.shapeOf("RC0"), "diamond");
  assert.equal(s.shapeOf("RAB1"), "circle");
  assert.equal(s.shapeOf("X1"), "circle");
  assert.deepEqual(s.key.map((k) => [k.label, k.shape, k.n]), [["AC", "square", 5], ["DD", "triangle", 3], ["RC", "diamond", 2], ["other / not recorded", "circle", 2]]);
});

test("only the plan's holes count; no field: circles and no key", () => {
  const s = drillPlanShapes(collars, "hole_type", ["DD0", "DD1", "X1"]);
  assert.deepEqual(s.key.map((k) => [k.label, k.shape]), [["DD", "square"], ["not recorded", "circle"]]);
  assert.deepEqual(drillPlanShapes(collars, null).key, []);
});

test("the shapes' paths", () => {
  assert.match(symbolPath("square", 10, 10, 2), /^M8\.2,8\.2h3\.6v3\.6h-3\.6z$/);
  assert.match(symbolPath("triangle", 0, 0, 2), /^M0,-2\.5L/);
  assert.equal(symbolPath("circle", 0, 0, 2), null);
});

test("wired: the drawing, the key and the sidebar select", () => {
  const d = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(d, /const shapes = drillPlanShapes\(collars, el\.shapeBy, g\.holes\.map\(\(hh\) => hh\.id\)\);/);
  assert.match(d, /path = symbolPath\(d\.shapes\.shapeOf\(hh\.id\), hh\.ax, hh\.ay, s\.rMm \* MM\)/);
  assert.match(d, /\{d\.shapeKey\.map\(/);
  const c = readFileSync(new URL("../src/components/DrillPlanColourControls.jsx", import.meta.url), "utf8");
  assert.match(c, /onChange=\{\(e\) => updateSelected\(\{ shapeBy: e\.target\.value \|\| null \}\)\}/);
});

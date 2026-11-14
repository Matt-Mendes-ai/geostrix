// TASKS.csv #3355 (#3277's follow-up, WA gold) — the reference grid's walls reach the desurveyed traces' lowest point, not each hole's collar
// dip x length (deep deviated holes ran below the frame); without traces, the collars' estimate as before.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gridPlacement, tracesLowest } from "../src/lib/viewer/gridGroup.js";

const collars = [{ hole_id: "A", x: 0, y: 0, z: 400, dip: -60, length: 500 }, { hole_id: "B", x: 100, y: 0, z: 380, dip: -60, length: 300 }];

test("the depth below the mean collar from the traces' lowest elevation", () => {
  // A steepens down the hole: its end at RL -150, deeper than 500 x sin 60 = 433 m below its collar (RL -33)
  const traces = [{ hole_id: "A", wz: [400, 200, -150] }, { hole_id: "B", wz: [380, 200, 120] }];
  assert.equal(tracesLowest(traces), -150);
  const p = gridPlacement(collars, [], traces);
  assert.equal(p.depth, 390 - -150);
});

test("no traces yet: the collars' dip x length estimate, as before; traces all above the mean collar: 0", () => {
  const est = 390 - (400 - 500 * Math.sin(Math.PI / 3));
  assert.ok(Math.abs(gridPlacement(collars, []).depth - est) < 1e-9);
  assert.ok(Math.abs(gridPlacement(collars, [], []).depth - est) < 1e-9);
  assert.equal(gridPlacement(collars, [], [{ wz: [400, 395] }]).depth, 0);
});

test("the 3D View passes its traces and redraws the grid when they are rebuilt", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /buildGridGroup\(gridConfig, gridPlacement\(collars, survey, tracesRef\.current \/\* #3355 \*\/\), DEFAULT_GRID\.color\);/);
  assert.match(v, /\}, \[gridConfig, collars, survey, tracesSeq\]\);/);
});

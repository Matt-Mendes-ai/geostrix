// TASKS.csv #2616 (re-test of #2528) — the model box's drilled column: the Model area's holes only, each trace cut at its logged end
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drilledColumn, clipTrace } from "../src/lib/contactReach.js";

test("a trace is cut at the hole's logged depth, interpolated on the segment", () => {
  const t = [{ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 200 }, { x: 0, y: 0, z: -50 }]; // surveyed to 350 m, logged to 150
  const c = clipTrace(t, 150);
  assert.equal(c.length, 3);
  assert.equal(c[2].z, 150);
  assert.deepEqual(clipTrace(t, null), t);
  assert.deepEqual(clipTrace(t, 1000), t);
});

test("the column names its top and bottom holes, and a hole left out cannot set the floor", () => {
  const box = { xmin: 0, xmax: 100, ymin: 0, ymax: 100 };
  const inArea = [{ x: 10, y: 10, z: 271, hole: "RC1" }, { x: 10, y: 10, z: 22, hole: "RC1" }, { x: 50, y: 50, z: 120, hole: "RC2" }];
  const outside = [{ x: 2, y: 2, z: 300, hole: "RD555" }, { x: 2, y: 2, z: -177, hole: "RD555" }];
  assert.deepEqual(drilledColumn(inArea, box), { min: 22, max: 271, minHole: "RC1", maxHole: "RC1" });
  assert.equal(drilledColumn([...inArea, ...outside], box).min, -177); // why the run passes the area's holes only
});

test("the run takes the Model area's holes, clipped, and the notice names them", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /traces\.filter\(\(t\) => modelArea !== "checked" \|\| !\(visibleHoles && visibleHoles\[t\.hole_id\] === false\)\)\.flatMap\(\(t\) => reachLib\.clipTrace\(t\.pts\.map\(sceneToApi\), lenOf\.get\(t\.hole_id\)\)/);
  assert.match(m, /Its height follows the drilling under it \(\{area\}\): RL \{top\} \(\{topHole\}\) to RL \{bottom\} \(\{bottomHole\}\), each hole to its logged depth\./);
  assert.match(m, /appendNotice\(notice\("Surfaces stop near their own contacts:/);
});

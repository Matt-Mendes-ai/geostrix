// TASKS.csv #2211 (review #2174, WA gold) — the reference grid: lifted to the highest collar on a project drilled from underground, and
// labelled with easting, northing and RL
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridPlacement, gridTicks, buildGridGroup } from "../src/lib/viewer/gridGroup.js";

const ug = [];
for (let i = 0; i < 6; i++) ug.push({ hole_id: `U${i}`, x: 32000 + i, y: 808000, z: 400 - i * 60, dip: i % 2 ? -30 : 60, length: 100 }); // upholes, stacked
const surf = [{ hole_id: "A", x: 0, y: 0, z: 100, dip: 60, length: 200 }, { hole_id: "B", x: 500, y: 0, z: 140, dip: 60, length: 200 }, { hole_id: "C", x: 0, y: 500, z: 120, dip: 60, length: 200 }];

test("underground collars lift the plane to the highest collar; surface collars keep the mean", () => {
  const u = gridPlacement(ug, ug.map((c) => ({ hole_id: c.hole_id, depth: 0, dip: c.dip })));
  assert.equal(u.origin.z, 250); // the mean, the scene's origin
  assert.equal(u.lift, 150); // 400 - 250
  const s = gridPlacement(surf, []);
  assert.equal(s.lift, 0);
  assert.equal(gridPlacement([], []), null);
});

test("about five labels per edge, on cell lines", () => {
  const t = gridTicks(1000, 20);
  assert.equal(t.cell, 50);
  assert.deepEqual(t.ticks, [-500, -300, -100, 100, 300, 500]);
  assert.deepEqual(gridTicks(500, 5).ticks, [-250, -150, -50, 50, 150, 250]);
});

test("the group: the plane at the lift, the walls hanging from it, no labels without a document (Node)", () => {
  const g = buildGridGroup({ visible: true, mode: "3d", size: 1000, divisions: 20 }, { depth: 300, lift: 150, origin: { x: 0, y: 0, z: 250 } });
  assert.equal(g.children.length, 3);
  assert.equal(g.children[0].position.y, 150);
  const h = 450; // gridWallHeight(1000, 20, 450): as deep as the drilling (#2369: no longer at least the grid's size)
  assert.equal(g.children[1].position.y, 150 - h / 2);
  assert.equal(g.userData.labels, undefined); // sprites need a canvas
  assert.equal(buildGridGroup({ visible: false }, null).children.length, 0);
});

test("the view keeps the labels a fixed size on screen and passes the survey", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(gridGroupRef\.current\?\.userData\.labels\) fitScreenLabels\(gridGroupRef\.current\.userData\.labels, camera, mount\.clientHeight\);/);
  assert.doesNotMatch(v, /^function buildGridGroup/m);
});

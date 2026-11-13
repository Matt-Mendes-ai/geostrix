// TASKS.csv #2084 (review #2013, Surface Geology) — from above, a dip disc showed no dip side: its down-dip tick lay inside the disc's slab,
// hidden by the top face. The tick now sits above the upper face, so in plan it points to the dip direction.
// TASKS.csv #3066 — the disc is gone (Matt: discs for drillhole structures only): the FGDC symbol lies on the ground; its dip tick (6.2: the
// second segment, after the strike line) still points down dip in plan. The disc-only checks below now check the flat symbol.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { syncSurfaceStructures } from "../src/lib/viewer/sceneBuilders.js";

const origin = { x: 0, y: 0, z: 0 };
const tickOf = (dip, dipDir) => {
  const group = new THREE.Group(), cache = {};
  syncSurfaceStructures(group, cache, [{ id: "s", size: 60, rows: [{ x: 100, y: 200, z: 0, dip, dipDir, cls: "bedding" }] }], { origin, terrain: null });
  const lines = cache.s.children.find((c) => c.isLineSegments), disc = cache.s.children.find((c) => c.isInstancedMesh);
  const a = lines.geometry.attributes.position.array, m = new THREE.Matrix4(); disc.getMatrixAt(0, m);
  const centre = new THREE.Vector3().setFromMatrixPosition(m);
  return { start: new THREE.Vector3(a[6], a[7], a[8]), end: new THREE.Vector3(a[9], a[10], a[11]), centre, strike: [new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(a[3], a[4], a[5])], all: a };
};
const planAzimuth = (t) => { const e = t.end.x - t.start.x, n = -(t.end.z - t.start.z); return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360; };

test("35° -> 120 and 35° -> 300 now point opposite ways in plan", () => {
  assert.ok(Math.abs(planAzimuth(tickOf(35, 120)) - 120) < 0.01);
  assert.ok(Math.abs(planAzimuth(tickOf(35, 300)) - 300) < 0.01);
});
test("#3066: the symbol lies flat, just above the ground (0.3 m + 0.004 x size), starting at the point of observation", () => {
  const t = tickOf(35, 120);
  for (let i = 1; i < t.all.length; i += 3) assert.ok(Math.abs(t.all[i] - (0.3 + 60 * 0.004)) < 1e-5, String(t.all[i]));
  assert.ok(Math.hypot(t.start.x - 100, t.start.z + 200) < 1e-3, "the tick starts at the point");
});
test("#3066: the strike line is the set's size long (the standard's 5.0 mm), square to the dip direction", () => {
  const t = tickOf(35, 120), [a, b] = t.strike;
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 60) < 1e-3); // Float32 positions
  const e = b.x - a.x, n = -(b.z - a.z), az = ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
  assert.ok(Math.abs(az - 30) < 0.01, String(az)); // the right-hand-rule strike of 35 -> 120 is 030
  assert.ok(Math.abs(Math.hypot(t.end.x - t.start.x, t.end.z - t.start.z) - 60 / 5) < 1e-3, "the 1.0 mm tick: size / 5");
});

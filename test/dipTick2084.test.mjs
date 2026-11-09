// TASKS.csv #2084 (review #2013, Surface Geology) — from above, a dip disc showed no dip side: its down-dip tick lay inside the disc's slab,
// hidden by the top face. The tick now sits above the upper face, so in plan it points to the dip direction.
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
  return { start: new THREE.Vector3(a[0], a[1], a[2]), end: new THREE.Vector3(a[3], a[4], a[5]), centre };
};
const planAzimuth = (t) => { const e = t.end.x - t.start.x, n = -(t.end.z - t.start.z); return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360; };

test("35° -> 120 and 35° -> 300 now point opposite ways in plan", () => {
  assert.ok(Math.abs(planAzimuth(tickOf(35, 120)) - 120) < 0.01);
  assert.ok(Math.abs(planAzimuth(tickOf(35, 300)) - 300) < 0.01);
});
test("the tick starts above the disc's upper face (half thickness 0.03 x size), along the pole", () => {
  const t = tickOf(35, 120);
  const pole = new THREE.Vector3(Math.sin((120 * Math.PI) / 180) * Math.sin((35 * Math.PI) / 180), Math.cos((35 * Math.PI) / 180), -Math.cos((120 * Math.PI) / 180) * Math.sin((35 * Math.PI) / 180));
  const along = t.start.clone().sub(t.centre).dot(pole);
  assert.ok(along > 60 * 0.03 && along < 60 * 0.05, String(along));
});
test("a shallow dip draws a longer plan tick than a steep one", () => {
  const len = (t) => Math.hypot(t.end.x - t.start.x, t.end.z - t.start.z);
  assert.ok(len(tickOf(20, 90)) > len(tickOf(70, 90)) * 2);
});

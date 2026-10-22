// TASKS.csv #813 — where a dragged explicit-surface pick goes
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { dragTarget } from "../src/lib/explicitDrag.js";

const origin = { x: 500000, y: 6000000, z: 1000 };
// a vertical hole at the origin from 0 to -200 m elevation (scene y), md 0..200; world arrays for findOnTraceWorld
const trace = { hole_id: "H1", pts: [{ x: 0, y: 0, z: 0, md: 0 }, { x: 0, y: -200, z: 0, md: 200 }], wx: [500000, 500000], wy: [6000000, 6000000], wz: [1000, 800] };
const sc = { origin: { current: origin }, traces: { current: [trace] }, litho: [{ hole_id: "H1", from: 0, to: 47.5 }, { hole_id: "H1", from: 47.5, to: 120 }, { hole_id: "H2", from: 0, to: 60 }] };
const rayAt = (y) => new THREE.Ray(new THREE.Vector3(-500, y, 0), new THREE.Vector3(1, 0, 0)); // horizontal ray crossing the hole at scene height y

test("#813 a hole pick slides along its trace to the point nearest the mouse ray", () => {
  const p = dragTarget({ id: "a", hole_id: "H1", md: 10, x: 500000, y: 6000000, z: 990 }, rayAt(-55), sc, false, false);
  assert.ok(Math.abs(p.md - 55) < 1e-6 && Math.abs(p.z - 945) < 1e-6 && p.src === "trace", JSON.stringify(p));
});

test("#813 with snapping it lands on that hole's nearest logged boundary, not another hole's", () => {
  const p = dragTarget({ id: "a", hole_id: "H1", md: 10, x: 500000, y: 6000000, z: 990 }, rayAt(-55), sc, true, false);
  assert.equal(p.md, 47.5); // H1 boundaries 0 / 47.5 / 120; H2's 60 is ignored
  assert.equal(p.z, 952.5);
  assert.equal(p.src, "boundary");
});

test("#813 a free point moves only vertically, or only horizontally with Shift", () => {
  const pick = { id: "b", x: 500100, y: 6000050, z: 950, src: "point" }; // scene (100, -50, -50)
  const ray = new THREE.Ray(new THREE.Vector3(100, -20, 500), new THREE.Vector3(0, 0, -1)); // looking north at scene height -20
  const v = dragTarget(pick, ray, sc, true, false);
  assert.deepEqual([v.x, v.y, Math.round(v.z * 1e6) / 1e6], [500100, 6000050, 980]);
  const down = new THREE.Ray(new THREE.Vector3(130, 100, -80), new THREE.Vector3(0, -1, 0)); // straight down over (130, -80)
  const h = dragTarget(pick, down, sc, true, true);
  assert.deepEqual([h.x, h.y, h.z], [500130, 6000080, 950]);
  assert.equal(dragTarget(pick, down, sc, true, false), null); // straight down has no vertical plane facing the camera
});

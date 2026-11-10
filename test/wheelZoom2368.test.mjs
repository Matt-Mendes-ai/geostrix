// TASKS.csv #2368 (review #2325, WA uranium) — the wheel zooms toward the cursor: the point under it stays where it is on screen
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { wheelZoom, scaleTargetAbout, rayPlaneY } from "../src/modules/viewer/wheelZoom.js";

// the viewer's orbit (ViewerModule updateCamera): position = target + radius * (sinφ sinθ, cosφ, sinφ cosθ)
const place = (camera, cs) => {
  camera.position.set(cs.target.x + cs.radius * Math.sin(cs.phi) * Math.sin(cs.theta), cs.target.y + cs.radius * Math.cos(cs.phi), cs.target.z + cs.radius * Math.sin(cs.phi) * Math.cos(cs.theta));
  camera.lookAt(cs.target); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
};
const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 800 }) };
const toScreen = (camera, p) => { const v = new THREE.Vector3(p.x, p.y, p.z).project(camera); return [(v.x + 1) * 800, (1 - v.y) * 400]; };

test("three notches in at a collar off-centre: the collar stays under the pointer (ground plane hit)", () => {
  const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 1e7);
  const cs = { radius: 12000, phi: 0.35, theta: 0.6, target: new THREE.Vector3(0, 0, 0) };
  place(camera, cs);
  const collar = { x: 1800, y: 0, z: -900 }; // on the plane through the target
  const [sx, sy] = toScreen(camera, collar);
  for (let k = 0; k < 3; k++) { wheelZoom({ deltaY: -100, clientX: sx, clientY: sy }, el, camera, new THREE.Raycaster(), cs, () => null); place(camera, cs); }
  const [ax, ay] = toScreen(camera, collar);
  assert.ok(cs.radius < 12000 * 0.7, String(cs.radius));
  assert.ok(Math.hypot(ax - sx, ay - sy) < 0.5, `${sx},${sy} -> ${ax},${ay}`);
});

test("an object hit wins over the plane; nothing under the cursor zooms on the centre", () => {
  const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 1e7);
  const cs = { radius: 1000, phi: 0.8, theta: 0, target: new THREE.Vector3(0, 0, 0) };
  place(camera, cs);
  const hole = { x: 120, y: 80, z: 40 }; // above the plane: a hit object
  const [sx, sy] = toScreen(camera, hole);
  wheelZoom({ deltaY: -200, clientX: sx, clientY: sy }, el, camera, new THREE.Raycaster(), cs, () => hole); place(camera, cs);
  const [ax, ay] = toScreen(camera, hole);
  assert.ok(Math.hypot(ax - sx, ay - sy) < 0.5);
  // looking up at the sky (no plane crossing in front): the target stays put
  const t = { x: 1, y: 2, z: 3 };
  assert.deepEqual(scaleTargetAbout(t, null, 10, 5), { x: 1, y: 2, z: 3 });
  assert.equal(rayPlaneY({ origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: 1, z: 0 } }, 0), null);
});

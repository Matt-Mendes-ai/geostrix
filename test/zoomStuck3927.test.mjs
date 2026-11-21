// TASKS.csv #3927 — StrixViewer zoom got stuck: zooming in on the ground converged the camera onto it (a 5 cm orbit, under the 10 cm near plane, so the
// view looked at the terrain's underside), the scale bar read 1 cm and each notch moved about a centimetre. Reproduced here on SYNTHETIC ground (a flat
// terrain at elevation 0) and a 2 km grid of hole points, with the same camera the 3D view builds: the closest orbit is now tied to the scene's size,
// a step never brings the camera closer than that to the point it aimed at, a stuck camera gets out at the first notch, a collapsed saved camera is not
// restored (the view fits), and the scale bar says there is nothing under the view centre when that point is closer than the near plane.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { wheelZoom, rayPlaneY, sceneMinRadius, sceneSizeOf } from "../src/modules/viewer/wheelZoom.js";
import { applySavedCamera, MIN_RESTORED_RADIUS } from "../src/modules/viewer/savedCamera.js";

// the 3D view's camera update (ViewerModule): position from the orbit, near plane 1 % of the orbit (at least 10 cm)
function makeView() {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 5e6);
  const cs = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 600, target: new THREE.Vector3(0, 0, 0) };
  const update = () => {
    camera.position.set(cs.target.x + cs.radius * Math.sin(cs.phi) * Math.sin(cs.theta), cs.target.y + cs.radius * Math.cos(cs.phi), cs.target.z + cs.radius * Math.sin(cs.phi) * Math.cos(cs.theta));
    camera.lookAt(cs.target);
    camera.near = Math.max(0.1, cs.radius * 0.01); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  };
  update();
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }) };
  const anchors = [];
  for (let x = -1000; x <= 1000; x += 100) for (let z = -1000; z <= 1000; z += 100) anchors.push(x, 0, z, x, -200, z); // collars and hole bottoms
  const ground = (rc) => rayPlaneY(rc.ray, 0); // the synthetic terrain: what the cursor's ray hits first
  const notch = (deltaY, clientX = 800, clientY = 500) => { wheelZoom({ deltaY, clientX, clientY }, el, camera, new THREE.Raycaster(), cs, ground, { anchors }); update(); };
  const toGround = () => { const rc = new THREE.Raycaster(); rc.setFromCamera({ x: 0, y: 0 }, camera); const p = rayPlaneY(rc.ray, 0); return p ? camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) : Infinity; };
  return { camera, cs, notch, toGround, anchors };
}

test("#3927 the closest orbit comes from the scene's size (1 / 5,000 of it, 0.5 m to 25 m)", () => {
  assert.equal(sceneMinRadius(0), 0.5);
  assert.equal(sceneMinRadius(2000), 0.5);
  assert.ok(Math.abs(sceneMinRadius(2829) - 0.5658) < 1e-9);
  assert.equal(sceneMinRadius(20000), 4);
  assert.equal(sceneMinRadius(1e7), 25);
  assert.ok(Math.abs(sceneSizeOf([0, 0, 0, 3, 4, 0], null) - 5) < 1e-9);
  assert.ok(Math.abs(sceneSizeOf(null, [0, 0, 0, 3, 0, 4]) - 5) < 1e-9);
});

test("#3927 zooming in on the ground stops at the scene's minimum: never onto (or through) it, never under the near plane; one notch out moves usefully", () => {
  const v = makeView();
  const min = sceneMinRadius(sceneSizeOf(v.anchors, null));
  for (let k = 0; k < 300; k++) v.notch(-100); // 300 notches in, at the view centre, over the ground
  assert.ok(v.cs.radius >= min - 1e-9, `orbit ${v.cs.radius}`);
  assert.ok(v.toGround() >= min - 1e-6, `camera ${v.toGround()} m from the ground`);
  assert.ok(v.cs.radius > v.camera.near, "the point at the view centre stays in front of the near plane");
  assert.ok(v.camera.position.y > 0, "the camera is above the ground, not under it");
  const r = v.cs.radius; v.notch(100);
  assert.ok(v.cs.radius >= r * 1.1, "a notch out moves at least 10 %");
});

test("#3927 a camera already collapsed onto the ground (a 5 cm orbit) gets out at the first notch, in or out", () => {
  for (const dy of [-100, 100]) {
    const v = makeView();
    v.cs.radius = 0.05; v.cs.target.set(0, 0, 0);
    v.notch(dy);
    assert.ok(v.cs.radius >= 0.5, `orbit ${v.cs.radius} after one notch of ${dy}`);
  }
});

test("#3927 a saved camera collapsed onto a surface is not restored: the view fits as for a project with no camera", () => {
  const camState = { current: { theta: 0, phi: 1, radius: 600, target: new THREE.Vector3() } }, cameraRef = { current: null }, fit = { current: false };
  assert.equal(applySavedCamera({ theta: 1, phi: 1, radius: 0.05, target: { x: 0, y: 0, z: 0 } }, camState, cameraRef, fit), false);
  assert.equal(fit.current, false, "the first fit still runs");
  assert.equal(camState.current.radius, 600);
  assert.equal(MIN_RESTORED_RADIUS, 0.5);
  assert.equal(applySavedCamera({ theta: 1, phi: 1, radius: 250, target: { x: 1, y: 2, z: 3 } }, camState, cameraRef, fit), true);
  assert.equal(camState.current.radius, 250);
});

test("#3927 the scale bar says 'nothing under the view centre' when that point is closer than the near plane", () => {
  const o = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(o, /const clipped = !\(cs\.radius > \(cam\.near \|\| 0\)\);/);
  assert.match(o, /<span ref=\{nothingRef\} style=\{\{ display: "none" \}\}>\{tr\("nothing under the view centre"\)\}<\/span>/);
});

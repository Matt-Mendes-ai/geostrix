// TASKS.csv #3667 — a tube drawn at the 1.5 px floor (#3643) is also picked within about 4 px of its axis: its real geometry is sub-pixel.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { rayToSegment, tubeAxis, tubeAxisHit, tubePixelScale, TUBE_PICK_PX } from "../src/lib/viewer/tubePick.js";
import { TUBE_UNIFORMS } from "../src/lib/viewer/tubeShader.js";
import { buildLayerBatches } from "../src/lib/viewer/layerBatches.js";
import { buildPickIndex, queryPickIndex } from "../src/lib/pickIndex.js";
import { PickStandIn, PICK_ONLY_LAYER } from "../src/lib/viewer/pickStandIn.js";
import { PROTO_CYLINDER, PROTO_SPHERE_10, UP_Y } from "../src/lib/viewer/protos.js";

test("rayToSegment: the perpendicular distance, the ends, a segment behind the camera, parallel", () => {
  const a = rayToSegment(0, 0, 0, 0, 0, 1, -5, 3, 100, 5, 3, 100); // a segment across the ray, 3 m above it
  assert.ok(Math.abs(a.dist - 3) < 1e-9 && Math.abs(a.t - 100) < 1e-9 && Math.abs(a.s - 0.5) < 1e-9);
  const b = rayToSegment(0, 0, 0, 0, 0, 1, 4, 0, 100, 10, 0, 100); // the ray passes 4 m from the near end
  assert.ok(Math.abs(b.dist - 4) < 1e-9 && b.s === 0);
  const c = rayToSegment(0, 0, 0, 0, 0, 1, 0, 2, -50, 0, 2, -10); // behind the camera: the origin to the segment
  assert.ok(c.t === 0 && Math.abs(c.dist - Math.hypot(2, 10)) < 1e-9);
  const d = rayToSegment(0, 0, 0, 0, 0, 1, 1, 0, 10, 1, 0, 50); // parallel, 1 m beside
  assert.ok(Math.abs(d.dist - 1) < 1e-6);
  assert.equal(rayToSegment(0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1), null);
});

// a camera looking down +z... three looks down -z; build a real one 5 km from a 40 m tube of 0.8 m radius
function scene() {
  const cam = new THREE.PerspectiveCamera(50, 2, 1, 1e7);
  cam.position.set(0, 0, 5000); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  TUBE_UNIFORMS.uViewportH.value = 800;
  return cam;
}
const pxAt = (cam, depth) => (2 * depth) / (cam.projectionMatrix.elements[5] * 800); // metres per pixel at a depth

test("tubePixelScale and tubeAxisHit: within 4 px of the axis, not beyond; the true radius when it is wider", () => {
  const cam = scene(), sc = tubePixelScale(cam);
  assert.ok(sc && sc.k > 0 && sc.c === 0);
  const ortho = new THREE.OrthographicCamera(-100, 100, 50, -50, 1, 1000); ortho.updateProjectionMatrix();
  assert.ok(tubePixelScale(ortho).c > 0 && tubePixelScale(ortho).k === 0);
  assert.equal(tubePixelScale(null), null);
  // a vertical tube, 40 m long, 0.8 m radius at the origin: base matrix = translate(0,-20,0) * scale(0.8, 40, 0.8)
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0, -20, 0), new THREE.Quaternion(), new THREE.Vector3(0.8, 40, 0.8));
  const base = Float32Array.from(m.elements), mw = new THREE.Matrix4().elements;
  const A = tubeAxis(base, 0, mw);
  assert.ok(Math.abs(A.ay + 20) < 1e-5 && Math.abs(A.by - 20) < 1e-5 && Math.abs(A.r - 0.8) < 1e-5);
  const m1 = pxAt(cam, 5000); // ~ 11 m per pixel here
  const ray = (dxPx) => new THREE.Ray(new THREE.Vector3(dxPx * m1, 0, 5000), new THREE.Vector3(0, 0, -1));
  assert.ok(tubeAxisHit(base, 0, mw, ray(0), sc), "on the axis");
  assert.ok(tubeAxisHit(base, 0, mw, ray(3), sc), "3 px off");
  assert.ok(Math.abs(tubeAxisHit(base, 0, mw, ray(3), sc).distance - 5000) < 1e-6);
  assert.equal(tubeAxisHit(base, 0, mw, ray(TUBE_PICK_PX + 2), sc), null, "6 px off");
  assert.equal(tubeAxisHit(base, 0, mw, ray(0), null), null, "no camera scale: no widened pick");
  // near the camera the true radius is wider than 4 px: the reach is the radius
  const near = new THREE.Ray(new THREE.Vector3(0.7, 0, 20), new THREE.Vector3(0, 0, -1));
  assert.ok(tubeAxisHit(base, 0, mw, near, sc), "inside the radius");
  assert.equal(tubeAxisHit(base, 0, mw, new THREE.Ray(new THREE.Vector3(2, 0, 20), new THREE.Vector3(0, 0, -1)), sc), null);
});

// 30 vertical tubes and 30 spheres in two batches, through the real batching and the real pick index
function batches(proto, n = 30) {
  const group = new THREE.Group(); group.name = "g";
  for (let i = 0; i < n; i++) {
    const s = new PickStandIn(proto, { color: 0x888888 });
    if (proto === PROTO_CYLINDER) { s.scale.set(0.8, 40, 0.8); s.position.set(i * 200 - 3000, -20, 0); } else { s.scale.setScalar(0.8); s.position.set(i * 200 - 3000, 0, 0); }
    s.quaternion.setFromUnitVectors(UP_Y, new THREE.Vector3(0, 1, 0));
    s.userData = { holeId: "H" + i, row: { from: 0, to: 40 } };
    s.updateMatrix(); s.updateMatrixWorld();
    group.add(s);
  }
  group.updateMatrixWorld(true);
  buildLayerBatches(group);
  const inst = group.children.find((c) => c.isInstancedMesh);
  return { group, inst };
}
function pick(cam, x, y, objects) {
  const rc = new THREE.Raycaster(); rc.layers.enable(PICK_ONLY_LAYER);
  rc.setFromCamera({ x, y }, cam);
  const idx = buildPickIndex(objects), cands = queryPickIndex(idx, rc);
  return { hits: rc.intersectObjects(cands, false), cands };
}

test("through the real pick index: a ray 3 px from a floor tube hits it, 30 px from it does not; a sphere batch is unchanged", () => {
  const cam = scene();
  const { inst } = batches(PROTO_CYLINDER);
  assert.equal(inst.userData.tubeFloor, true);
  assert.ok(inst.userData.compact, "a compact batch of stand-ins");
  const px = (n) => (n * 2) / 1600; // the viewport is 1600 x 800 (camera aspect 2, uViewportH 800)
  // the tube i = 15 is at x = 0: the ray through the screen centre goes along the axis' neighbourhood: nearest tubes 200 m = ~18 px away
  const on = pick(cam, px(3), 0, [inst]);
  assert.ok(on.hits.length >= 1 && on.hits[0].object.userData.holeId === "H15", "3 px off the axis hits H15");
  const off = pick(cam, px(9), 0, [inst]);
  assert.equal(off.hits.length, 0, "9 px off hits nothing");
  const { inst: spheres } = batches(PROTO_SPHERE_10);
  assert.ok(!spheres.userData.tubeFloor);
  assert.equal(pick(cam, px(3), 0, [spheres]).hits.length, 0, "a sphere batch is picked as before: a sub-pixel sphere is missed");
});

test("wiring: the tubes are flagged where the batch is made; the index widens only a tube batch's boxes", () => {
  const lb = readFileSync(new URL("../src/lib/viewer/layerBatches.js", import.meta.url), "utf8");
  assert.match(lb, /if \(isTubeProto\(fam\.geometry\)\) inst\.userData\.tubeFloor = true;/);
  const pi = readFileSync(new URL("../src/lib/pickIndex.js", import.meta.url), "utf8");
  assert.match(pi, /obj\.userData\.tubeFloor \? px : null/);
});

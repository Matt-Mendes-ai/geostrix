// TASKS.csv #3838 — with no terrain a bare-ground click was read on the flat reference level at the scene origin's elevation while the map is drawn on
// the collar surface; #3839 — Interpret's snap took a contact down an inclined hole in the Top view, the click ray (not the camera) judged 'plan'.
// SYNTHETIC relief: collars on a hill rising 0.35 m/m to the east (RL 700 to 1,050), the scene origin at their mean elevation; a perspective camera.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { worldPointOnGround, groundCollarsFor } from "../src/modules/viewer/worldPoint.js";
import { collarGround } from "../src/lib/collarGround.js";
import { buildSnapIndex, snapRay, snapInterpretClick, cameraLooksDown, isPlanLook, snapTolerance } from "../src/lib/viewer/interpretSnap.js";

const collars = [];
for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const x = 433000 + i * 125, y = 6232000 + j * 125; collars.push({ hole_id: `H${i}${j}`, x, y, z: 700 + 0.35 * (i * 125) + 20 * Math.sin(j) }); }
const origin = { x: 433500, y: 6232500, z: collars.reduce((a, c) => a + c.z, 0) / collars.length };
const g = collarGround(collars);
const W = 1600, H = 800;
const cameraAt = (E, N, Z, look = { E, N, Z: Z - 1 }, fov = 45) => {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 1, 100000);
  cam.position.set(E - origin.x, Z - origin.z, origin.y - N); cam.up.set(0, 0, -1);
  cam.lookAt(look.E - origin.x, look.Z - origin.z, origin.y - look.N); cam.updateMatrixWorld(true);
  return cam;
};
// the ground under a screen pixel: the ray marched finely to the collar surface (the truth)
const truth = (ray) => {
  let prev = 0;
  for (let t = 1; t < 20000; t += 0.25) {
    const x = ray.origin.x + ray.direction.x * t + origin.x, y = -(ray.origin.z + ray.direction.z * t) + origin.y, h = ray.origin.y + ray.direction.y * t + origin.z;
    if (h - g(x, y) <= 0) { const tt = (prev + t) / 2; return { x: ray.origin.x + ray.direction.x * tt + origin.x, y: -(ray.origin.z + ray.direction.z * tt) + origin.y }; }
    prev = t;
  }
  return null;
};
const rayAt = (cam, px, py) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((px / W) * 2 - 1, -(py / H) * 2 + 1), cam); return rc.ray; };
const planeOnly = (ray) => worldPointOnGround(ray, [], origin, null);

test("the surface a bare-ground click goes to: the collar surface with no terrain, none with a terrain or underground", () => {
  assert.equal(groundCollarsFor(null, collars), collars);
  assert.equal(groundCollarsFor({ gridW: 2 }, collars), null);
  assert.equal(groundCollarsFor(null, collars.slice(0, 2)), null);
});

test("Top view over the low side of the hill: the click lands under the cursor (before: 11-30 % of its distance from the centre off)", () => {
  const cam = cameraAt(433200, 6232500, 1300); // over RL ~770 ground, the reference level at ~868
  const before = [], after = [];
  for (const [px, py] of [[100, 100], [1500, 120], [300, 700], [1400, 650], [800, 400], [1000, 430]]) {
    const ray = rayAt(cam, px, py), t = truth(ray), p0 = planeOnly(ray), p1 = worldPointOnGround(ray, [], origin, collars);
    assert.ok(p1.onCollarSurface, "on the collar surface");
    before.push(Math.hypot(p0.x - t.x, p0.y - t.y)); after.push(Math.hypot(p1.x - t.x, p1.y - t.y));
    assert.ok(Math.abs(p1.z - g(p1.x, p1.y)) < 1e-6);
  }
  const worst0 = Math.max(...before), worst1 = Math.max(...after);
  assert.ok(worst0 > 40, `before: ${worst0.toFixed(1)} m`); // the reference level ~100 m above the ground under the view
  assert.ok(worst1 < 0.5, `after: ${worst1.toFixed(2)} m`);
});

test("an oblique view across the hill, the high side under the cursor: still under the cursor", () => {
  const cam = cameraAt(432600, 6231700, 1500, { E: 433700, N: 6232500, Z: 900 });
  for (const [px, py] of [[800, 500], [200, 600], [1400, 300]]) {
    const ray = rayAt(cam, px, py), t = truth(ray), p1 = worldPointOnGround(ray, [], origin, collars);
    if (!t) continue;
    assert.ok(Math.hypot(p1.x - t.x, p1.y - t.y) < 1, `${px},${py}: ${Math.hypot(p1.x - t.x, p1.y - t.y).toFixed(2)} m`);
  }
});

test("a drawn hit still wins; looking up, or with no collars to follow, the reference level as before (plane: true)", () => {
  const cam = cameraAt(433200, 6232500, 1300), ray = rayAt(cam, 800, 400);
  const obj = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); obj.userData.tip = "Collar X";
  const hit = worldPointOnGround(ray, [{ object: obj, point: new THREE.Vector3(1, 2, 3), distance: 5 }], origin, collars);
  assert.equal(hit.x, origin.x + 1); assert.equal(hit.z, origin.z + 2); assert.ok(!hit.onCollarSurface);
  const flat = worldPointOnGround(ray, [], origin, null);
  assert.equal(flat.plane, true); assert.equal(flat.z, origin.z);
  const up = worldPointOnGround({ origin: new THREE.Vector3(0, -10, 0), direction: new THREE.Vector3(0, 1, 0) }, [], origin, collars);
  assert.equal(up.plane, true);
});

test("wiring: ViewerModule's pick, the section's two clicks and the unit polygon's note", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /groundCollarsRef\.current = groundCollarsFor\(terrain, collars\); \/\/ #3838/);
  assert.match(v, /const worldPointFromHits = useCallback\(\(raycaster, hits\) => worldPointOnGround\(raycaster\.ray, hits, originRef\.current, groundCollarsRef\.current\), \[\]\);/);
  assert.match(v, /const w = worldPointFromHits\(raycaster, pickHits\(raycaster\)\); \/\/ #3838/);
  assert.doesNotMatch(v.slice(v.indexOf("const onSectionClick"), v.indexOf("const onSectionClick") + 800), /intersectPlane/);
  const u = readFileSync(new URL("../src/components/UnitPolygonPane.jsx", import.meta.url), "utf8");
  assert.match(u, /plan && !mapLayerOnCollars\(next, terrain, collars\) \? " " \+ tr\("It lies flat at \{z\} m RL \(no terrain\)\."/);
  const m = readFileSync(new URL("../src/components/MeasureResults.jsx", import.meta.url), "utf8");
  assert.match(m, /\{planeNote\}\{collarNote\}/);
});

// ---- #3839
const sceneOf = (E, N, Z) => ({ x: E - origin.x, y: Z - origin.z, z: origin.y - N });
// an inclined hole from a pad at (433200, 6232500, ~770): 60 degrees toward the east, a contact at 167.7 m
const pad = { E: 433200, N: 6232500, Z: g(433200, 6232500) };
const along = (md) => sceneOf(pad.E + md * Math.cos(Math.PI / 3), pad.N, pad.Z - md * Math.sin(Math.PI / 3));
const fan = { hole_id: "SR-243", pts: [0, 50, 100, 167.7, 250].map((md) => ({ md, ...along(md) })) };
const layers = { litho: [{ hole_id: "SR-243", from: 100, to: 167.7, value: "SLT" }] };

test("#3839 the plan look is the camera's: a Top-view click far from the centre is still a plan look", () => {
  const cam = cameraAt(433300, 6232500, 1300);
  assert.equal(cameraLooksDown(cam), true);
  const ray = rayAt(cam, 1500, 100);
  assert.equal(isPlanLook(ray), false, "the click ray alone is more than 15 degrees off vertical");
  assert.equal(cameraLooksDown(cameraAt(432600, 6231700, 1500, { E: 433700, N: 6232500, Z: 900 })), false);
});

test("#3839 Top view: a click over the contact 167.7 m down the inclined hole is not tied to it (before: it was)", () => {
  const cam = cameraAt(433500, 6232500, 1300);
  const target = along(167.7), v = new THREE.Vector3(target.x, target.y, target.z).project(cam);
  const px = ((v.x + 1) / 2) * W, py = ((1 - v.y) / 2) * H;
  assert.ok(Math.hypot(px - W / 2, py - H / 2) > 250, `the contact is ${Math.hypot(px - W / 2, py - H / 2).toFixed(0)} px from the centre`);
  const ray = rayAt(cam, px, py), idx = buildSnapIndex([fan], layers, ["litho"], () => "Lithology"), tol = snapTolerance(cam, H);
  const old = snapRay(idx, ray, tol); // the click ray judged the look
  assert.equal(old?.kind, "boundary"); assert.equal(old.md, 167.7);
  assert.equal(snapRay(idx, ray, tol, cameraLooksDown(cam)), null);
  const world = worldPointOnGround(ray, [], origin, collars);
  const got = snapInterpretClick(world, ray, { on: true, traces: [fan], layers, visible: { litho: true }, origin, camera: cam, heightPx: H });
  assert.equal(got, world, "the ground under the cursor, untied");
  // the collar is still taken in the plan look
  const c = new THREE.Vector3(fan.pts[0].x, fan.pts[0].y, fan.pts[0].z).project(cam), cr = rayAt(cam, ((c.x + 1) / 2) * W + 3, ((1 - c.y) / 2) * H);
  assert.equal(snapInterpretClick(worldPointOnGround(cr, [], origin, collars), cr, { on: true, traces: [fan], layers, visible: { litho: true }, origin, camera: cam, heightPx: H }).snap.kind, "collar");
});

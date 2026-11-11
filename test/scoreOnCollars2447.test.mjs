// TASKS.csv #2447 / #2576 (reviews #2325 / #2486) — with no terrain a score map goes on the collar surface (drawn under the holes), not
// under the deepest hole; Pick on view takes the E / N of the map cell under the pointer
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { scoreRasterPlacement, holeTraces } from "../src/lib/evidenceSources.js";
import { syncRasterDrapes } from "../src/lib/viewer/sceneBuilders.js";
import { pickOnView } from "../src/modules/viewer/pickGround.js";
import { collarGround } from "../src/lib/pitShell.js";

// collars on a slope from RL 160 (west) to 330 (east), one 577 m hole under them (the WA lithium case)
const collars = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) collars.push({ hole_id: `H${i}${j}`, x: 414000 + i * 25, y: 6249600 + j * 25, z: 160 + i * 34, azimuth: 0, dip: 90, max_depth: i === 0 && j === 0 ? 577 : 60 });
const traces = holeTraces(collars, [], "minimum_curvature");

test("no terrain, surface collars: on the collar surface at the collars' median; a terrain: on it; underground collars: under the drilling", () => {
  const p = scoreRasterPlacement(null, collars, [], traces);
  assert.equal(p.drapeMode, "collars");
  assert.equal(p.kind, "collars");
  assert.ok(p.elevation >= 160 && p.elevation <= 330, String(p.elevation));
  assert.equal(scoreRasterPlacement({ id: 1 }, collars, [], traces).drapeMode, "terrain");
  const few = scoreRasterPlacement(null, collars.slice(0, 2), [], holeTraces(collars.slice(0, 2), [], "minimum_curvature"));
  assert.equal(few.drapeMode, "flat"); // two collars make no surface: the #1204 floor, as before
  assert.equal(few.kind, "floor");
  const low = Math.min(...[...holeTraces(collars.slice(0, 2), [], "minimum_curvature").values()].flat().map((p) => p.z));
  assert.ok(few.elevation < low && few.elevation >= low - 20, `${few.elevation} vs ${low}`);
});

test("the drape follows the collar surface and is drawn first, writing no depth (the holes over it)", () => {
  const group = new THREE.Group(), cache = {};
  const origin = { x: 414060, y: 6249660, z: 249 };
  const r = { id: "r1", bbox: [413990, 6249590, 414135, 6249735], dataUrl: "data:image/png;base64,", drapeMode: "collars", elevation: 245, opacity: 0.75 };
  // three's TextureLoader makes an <img>: a stand-in that never loads
  globalThis.document = globalThis.document || { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {}, set src(_) {} }) };
  syncRasterDrapes(group, cache, [r], { origin, terrain: null, renderer: null, collars });
  const m = cache.r1;
  assert.ok(m.userData.collarDrape);
  assert.equal(m.renderOrder, -1);
  assert.equal(m.material.transparent, false); // the opaque list: drawn before the holes, which then draw over it
  assert.equal(m.material.blending, THREE.CustomBlending); // and still blended at 75 %
  assert.equal(m.material.depthWrite, false);
  // vertices on the collar surface (scene y = elevation - origin z; plane local x/y = E/N offsets before the -90 deg rotation)
  const g = collarGround(collars), pos = m.geometry.attributes.position;
  for (const i of [0, Math.floor(pos.count / 2), pos.count - 1]) {
    const z = pos.getZ(i) + origin.z, e = (r.bbox[0] + r.bbox[2]) / 2 + pos.getX(i), n = (r.bbox[1] + r.bbox[3]) / 2 + pos.getY(i);
    assert.ok(Math.abs(z - g(e, n) - 0.15) < 1e-3, `${z} vs ${g(e, n)}`);
  }
  assert.equal(m.position.y, 0);
  // a terrain loaded later: the same raster drapes on it
  const flatAgain = {};
  syncRasterDrapes(new THREE.Group(), flatAgain, [{ ...r, drapeMode: "flat" }], { origin, terrain: null, renderer: null, collars });
  assert.ok(!flatAgain.r1.userData.collarDrape);
  assert.equal(flatAgain.r1.material.transparent, true);
});

test("Pick on view over a map cell: that cell's E / N, the Elev on the collar surface; a nearer object still wins", () => {
  const origin = { x: 414060, y: 6249660, z: 249 };
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75 }));
  sheet.userData.flatRaster = true;
  const hole = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  // the sheet hit at E 414101.5 N 6249691.3, scene y -529 (RL -280: the old floor); a hole further along the ray
  const sheetHit = { object: sheet, distance: 600, point: new THREE.Vector3(414101.5 - origin.x, -280 - origin.z, -(6249691.3 - origin.y)) };
  const holeHit = { object: hole, distance: 640, point: new THREE.Vector3(0, -560, 0) };
  const toWorld = () => { throw new Error("not reached: the raster hit is used"); };
  const p = pickOnView({ origin: new THREE.Vector3(), direction: new THREE.Vector3(0, -1, 0) }, [sheetHit, holeHit], toWorld, collars, origin);
  assert.ok(Math.abs(p.x - 414101.5) < 1e-6 && Math.abs(p.y - 6249691.3) < 1e-6);
  assert.ok(p.onRaster && p.onCollarSurface);
  assert.ok(Math.abs(p.z - collarGround(collars)(p.x, p.y)) < 1e-6);
  // a collar marker nearer than the sheet is what was clicked
  const marker = { object: hole, distance: 590, point: new THREE.Vector3(1, 2, 3) };
  const q = pickOnView({ origin: new THREE.Vector3(), direction: new THREE.Vector3(0, -1, 0) }, [marker, sheetHit], () => ({ x: 9, y: 9, z: 9, on: "collar" }), collars, origin);
  assert.equal(q.on, "collar");
  // a hidden sheet is not picked
  sheet.visible = false;
  const h = pickOnView({ origin: new THREE.Vector3(), direction: new THREE.Vector3(0, -1, 0) }, [sheetHit], () => ({ x: 1, y: 2, z: 3, on: "x" }), collars, origin);
  assert.equal(h.on, "x");
});

test("the Evidence overlay pane uses the placement and says where the map went", () => {
  const s = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(s, /scoreRasterPlacement\(terrain, drilledCollars\(collars\)\.collars, survey, traces, voxelModels\)/ /* voxelModels: #1837 */);
  assert.match(s, /drapeMode: place\.drapeMode/);
  assert.match(s, /on the ground interpolated between the collars because the project has no terrain; the holes are drawn over it/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /renderer: rendererRef\.current, collars \}\)/);
});

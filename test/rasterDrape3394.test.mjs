// TASKS.csv #3394 (#3380's follow-up) — a raster draped on a terrain is built on the terrain's own nodes and triangles (terrainDrapeGrid), as
// the map layers are: the even plane read bilinearly parted from the drawn triangles inside twisted cells and the ground showed through.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { syncRasterDrapes } from "../src/lib/viewer/sceneBuilders.js";
import { terrainMeshElevation } from "../src/lib/viewer/terrainDrape.js";
import { sampleTerrainElevation } from "../src/lib/viewer/geomath.js";

// TextureLoader needs an <img>; a stub is enough here (no texture is drawn)
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(v) {}, style: {} }), createElement: () => ({ getContext: () => null }) };

// a 5 x 5 grid, 100 m cells, strongly twisted (a saddle in every cell)
const N = 5, elevations = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) elevations[j * N + i] = ((i + j) % 2 ? 60 : 0) + 3 * i;
const terrain = { id: "t1", bbox: [0, 0, 400, 400], gridW: N, gridH: N, elevations };
const origin = { x: 200, y: 200, z: 0 };
const raster = { id: "r1", bbox: [30, 40, 370, 330], dataUrl: "data:image/png;base64,", drapeMode: "terrain", opacity: 0.8 };

function drapeAt(mesh, x, y) {
  mesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(new THREE.Vector3(x - origin.x, 1000, -(y - origin.y)), new THREE.Vector3(0, -1, 0));
  const hit = rc.intersectObject(mesh, false)[0];
  return hit ? hit.point.y + origin.z : NaN;
}

test("the drape lies on the drawn terrain, lifted, everywhere inside the raster: the ground never shows through", () => {
  const group = new THREE.Group(), cache = {};
  syncRasterDrapes(group, cache, [raster], { origin, terrain, renderer: null });
  const mesh = cache.r1;
  assert.ok(mesh.geometry.index, "an indexed grid on the terrain's nodes");
  assert.equal(mesh.geometry.getAttribute("position").count, 5 * 5, "x 30 / 100 / 200 / 300 / 370 by y 330 / 300 / 200 / 100 / 40: the nodes inside plus the edges");
  assert.equal(mesh.material.polygonOffset, true);
  let worst = Infinity, n = 0;
  for (let x = 35; x < 370; x += 7.3) for (let y = 45; y < 330; y += 6.1) {
    const d = drapeAt(mesh, x, y), g = terrainMeshElevation(terrain, x, y);
    if (!Number.isFinite(d)) continue;
    n++; worst = Math.min(worst, d - g);
  }
  assert.ok(n > 1500, `${n} points`);
  assert.ok(worst >= 0.15 - 1e-3, `the drape is at least its 0.15 m lift above the ground everywhere (worst ${worst.toFixed(3)} m)`);
  // the old drape's heights (bilinear, +0.15 m) on this terrain: metres under the drawn ground in places
  let old = Infinity;
  for (let x = 35; x < 370; x += 7.3) for (let y = 45; y < 330; y += 6.1) old = Math.min(old, sampleTerrainElevation(terrain, x, y) + 0.15 - terrainMeshElevation(terrain, x, y));
  assert.ok(old < -5, `the bilinear drape fell ${(-old).toFixed(1)} m under the ground`);
});

test("the UVs map the raster's corners as the flat plane's did (u east, v north)", () => {
  const group = new THREE.Group(), cache = {};
  syncRasterDrapes(group, cache, [raster], { origin, terrain, renderer: null });
  const g = cache.r1.geometry, pos = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (30 + 370) / 2, y = pos.getY(i) + (40 + 330) / 2;
    assert.ok(Math.abs(uv.getX(i) - (x - 30) / 340) < 1e-6 && Math.abs(uv.getY(i) - (y - 40) / 290) < 1e-6);
  }
});

test("wiring: the raster path uses terrainDrapeGrid; the bilinear plane is gone", () => {
  const s = fs.readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8");
  assert.match(s, /const dg = terrainDrapeGrid\(terrain, r\.bbox, \{ adaptiveError \}\);/);
  assert.doesNotMatch(s, /const SEG = Math\.round\(Math\.min\(160/);
});

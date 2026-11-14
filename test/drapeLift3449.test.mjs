// TASKS.csv #3449 (Matt, v0.1.117: "Hillshade is off in elevation y quite a bit. same with imagery") — a raster over the whole terrain floated
// hundreds of metres above it, the same height everywhere: the drape's lift was one number, the worst rise anywhere in the box, and next to
// a reprojected terrain's no-data corners (filled with the mean for sampling, never drawn: #421) a ridge's skipped node rose hundreds of
// metres above a quad that reached down to the fill. Copernicus GLO-30 at 56.35 N, -130.25 W in EPSG:3156: 380 m (513 nodes), 496 m (1,025).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { syncRasterDrapes, syncTerrain } from "../src/lib/viewer/sceneBuilders.js";
import { terrainDrapeGrid, terrainMeshElevation, adaptiveDrape } from "../src/lib/viewer/terrainDrape.js";
import { fillNoData, decodeNoDataMask, isNoData } from "../src/lib/demFill.js";

// TextureLoader needs an <img>; a stub is enough here (no texture is drawn)
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(v) {}, style: {} }), createElement: () => ({ getContext: () => null }) };

// 450 x 60 nodes, 10 m apart (more than 400 columns: the drape takes every second node), mountains 900-2,500 m, and the corners a UTM
// grid over a lon / lat box leaves without data (north-west and south-east triangles), filled with the mean as the terrain import does
const GW = 450, GH = 60, CELL = 10, raw = new Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
  const x = i * CELL, y = j * CELL;
  raw[j * GW + i] = i + 3 * j < 90 || (GW - 1 - i) + 3 * (GH - 1 - j) < 90 ? NaN
    : 1700 + 600 * Math.sin(x / 700) * Math.cos(y / 420) + 80 * Math.sin(x / 190 + y / 230); // smooth mountains, slopes up to ~45 degrees
}
const filled = fillNoData(raw);
const terrain = { id: "t3449", bbox: [400000, 6240000, 400000 + (GW - 1) * CELL, 6240000 + (GH - 1) * CELL], gridW: GW, gridH: GH, elevations: Float32Array.from(filled.elevations), noDataMask: filled.noDataMask };
const [xmin, ymin, xmax, ymax] = terrain.bbox;
const origin = { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2, z: 1700 };
const mask = decodeNoDataMask(terrain.noDataMask);
const drawnAt = (x, y) => { // the ground is drawn there: its cell has no no-data corner
  const i = Math.min(GW - 2, Math.floor((x - xmin) / CELL)), j = Math.min(GH - 2, Math.floor((ymax - y) / CELL));
  return ![[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].some(([a, b]) => isNoData(mask, b * GW + a));
};
const hillshade = { id: "hs", bbox: terrain.bbox, dataUrl: "data:image/png;base64,", drapeMode: "terrain", opacity: 0.8 }; // the whole terrain, as a hillshade of it

test("the case: a quad of the coarse drape reaching down to the fill puts a ridge hundreds of metres above it", () => {
  const dg = terrainDrapeGrid(terrain, terrain.bbox);
  assert.equal(dg.step, 2);
  // the old rule's one lift: every node's rise over the drape read on the raw heights (no-data nodes counted, their vertices at the fill)
  const W = dg.xs.length, z0 = new Float64Array(W * dg.ys.length);
  for (let r = 0; r < dg.ys.length; r++) for (let k = 0; k < W; k++) z0[r * W + k] = terrainMeshElevation(terrain, dg.xs[k], dg.ys[r]);
  let old = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = xmin + i * CELL, y = ymax - j * CELL, k = Math.min(W - 2, dg.xs.findIndex((v) => v > x) - 1), r = Math.min(dg.ys.length - 2, dg.ys.findIndex((v) => v < y) - 1);
    if (k < 0 || r < 0) continue;
    const tx = (x - dg.xs[k]) / (dg.xs[k + 1] - dg.xs[k]), ty = (dg.ys[r] - y) / (dg.ys[r] - dg.ys[r + 1]);
    const a = z0[r * W + k], b = z0[r * W + k + 1], c = z0[(r + 1) * W + k], d = z0[(r + 1) * W + k + 1];
    const s = tx + ty <= 1 ? a + tx * (b - a) + ty * (c - a) : d + (1 - tx) * (c - d) + (1 - ty) * (b - d);
    old = Math.max(old, terrain.elevations[j * GW + i] - s);
  }
  assert.ok(old > 100, `the old single lift would be ${old.toFixed(0)} m`);
  assert.ok(dg.lift instanceof Float32Array && dg.lift.length === W * dg.ys.length, "a lift per vertex");
});

test("the hillshade's drape lies on the drawn ground: at its vertices and at points between them, never under it, no constant offset", () => {
  const group = new THREE.Group(), cache = {};
  syncRasterDrapes(group, cache, [hillshade], { origin, terrain, renderer: null });
  const mesh = cache.hs, pos = mesh.geometry.getAttribute("position");
  mesh.updateMatrixWorld(true);
  // the vertices: scene height against the terrain mesh under them (only where the ground is drawn)
  const v = new THREE.Vector3(), gaps = [];
  for (let q = 0; q < pos.count; q++) {
    v.fromBufferAttribute(pos, q).applyMatrix4(mesh.matrixWorld);
    const x = v.x + origin.x, y = origin.y - v.z;
    if (!drawnAt(x, y)) continue;
    gaps.push(v.y + origin.z - terrainMeshElevation(terrain, x, y));
  }
  gaps.sort((a, b) => a - b);
  assert.ok(gaps.length > 5000, `${gaps.length} vertices over drawn ground`);
  const med = gaps[gaps.length >> 1], p95 = gaps[Math.floor(gaps.length * 0.95)];
  assert.ok(gaps[0] >= 0.15 - 1e-3, `no vertex under its 0.15 m lift (lowest ${gaps[0].toFixed(3)} m)`);
  assert.ok(med < 1, `the median vertex is ${med.toFixed(2)} m above the ground (was the one lift, hundreds of metres)`);
  assert.ok(p95 < 5, `95 % of the vertices within ${p95.toFixed(1)} m`);
  // between the vertices (the drawn triangles in between): never under the ground
  let worst = Infinity, n = 0;
  for (let s = 0; s < 400; s++) {
    const x = xmin + 5 + ((s * 1103) % 4480), y = ymin + 5 + ((s * 37) % 580);
    if (!drawnAt(x, y)) continue;
    const rc = new THREE.Raycaster(new THREE.Vector3(x - origin.x, 5000, -(y - origin.y)), new THREE.Vector3(0, -1, 0));
    const hit = rc.intersectObject(mesh, false)[0];
    if (!hit) continue;
    n++; worst = Math.min(worst, hit.point.y + origin.z - terrainMeshElevation(terrain, x, y));
  }
  assert.ok(n > 200, `${n} points`);
  assert.ok(worst >= 0.15 - 1e-3, `the ground never shows through (worst ${worst.toFixed(3)} m)`);
});

test("a drape vertex on a no-data node takes the highest drawn node within a step, not the fill", () => {
  const dg = terrainDrapeGrid(terrain, terrain.bbox), W = dg.xs.length;
  let checked = 0;
  for (let r = 0; r < dg.ys.length; r++) for (let k = 0; k < W; k++) {
    const i = Math.round((dg.xs[k] - xmin) / CELL), j = Math.round((ymax - dg.ys[r]) / CELL);
    if (!isNoData(mask, j * GW + i)) continue;
    let best = -Infinity;
    for (let jj = Math.max(0, j - 2); jj <= Math.min(GH - 1, j + 2); jj++) for (let ii = Math.max(0, i - 2); ii <= Math.min(GW - 1, i + 2); ii++) if (!isNoData(mask, jj * GW + ii)) best = Math.max(best, terrain.elevations[jj * GW + ii]);
    if (best === -Infinity) { assert.ok(Math.abs(dg.z[r * W + k] - filled.fillValue) < 1e-3, "no drawn node near: the fill stays"); continue; }
    assert.ok(Math.abs(dg.z[r * W + k] - best) < 1e-3); checked++;
  }
  assert.ok(checked > 10, `${checked} vertices beside the hole`);
});

test("a terrain with no no-data: unchanged on the grid's nodes (step 1, no lift inside)", () => {
  const N = 6, el = new Float32Array(N * N).map((_, q) => 100 + (q % N) * 7 + Math.floor(q / N) * 3);
  const t = { bbox: [0, 0, 500, 500], gridW: N, gridH: N, elevations: el };
  const dg = terrainDrapeGrid(t, t.bbox);
  assert.equal(dg.step, 1);
  assert.ok(dg.lift.every((v) => v === 0), "a plane: nothing rises");
  assert.equal(dg.uniformLift, 0);
  assert.equal(terrainDrapeGrid(t, t.bbox, { adaptiveError: 2 }).uniformLift, 2.5, "a decimated mesh: its error, for every vertex");
});

// a terrain drawn as an adaptive mesh (more than 90,000 nodes): 320 x 300 nodes, 20 m apart, smooth mountains, no-data corners
const AW = 320, AH = 300, AC = 20, araw = new Array(AW * AH);
for (let j = 0; j < AH; j++) for (let i = 0; i < AW; i++) {
  const x = i * AC, y = j * AC;
  araw[j * AW + i] = i + j < 40 || (AW - 1 - i) + (AH - 1 - j) < 40 ? NaN : 1500 + 500 * Math.sin(x / 900) * Math.cos(y / 700) + 120 * Math.sin(x / 300 + y / 410);
}
const afill = fillNoData(araw);
const big = { id: "t3449a", bbox: [500000, 6000000, 500000 + (AW - 1) * AC, 6000000 + (AH - 1) * AC], gridW: AW, gridH: AH, elevations: Float32Array.from(afill.elevations), noDataMask: afill.noDataMask };
const bigOrigin = { x: (big.bbox[0] + big.bbox[2]) / 2, y: (big.bbox[1] + big.bbox[3]) / 2, z: 1500 };
const ray = (mesh, x, y) => { const h = new THREE.Raycaster(new THREE.Vector3(x - bigOrigin.x, 9000, -(y - bigOrigin.y)), new THREE.Vector3(0, -1, 0)).intersectObject(mesh, false)[0]; return h ? h.point.y + bigOrigin.z : NaN; };

test("an adaptive terrain: the drape is the drawn mesh's own triangles, 0.15 m above it everywhere (the whole terrain and part of it)", () => {
  const tg = new THREE.Group(), tmesh = syncTerrain(tg, null, big, { origin: bigOrigin });
  assert.ok(tmesh.geometry.userData.adaptive, "drawn as an adaptive mesh");
  tmesh.updateMatrixWorld(true);
  const [x0, y0, x1, y1] = big.bbox;
  const part = { id: "part", bbox: [x0 + 1234.5, y0 + 987.6, x1 - 2345.6, y1 - 1500.3], dataUrl: "data:image/png;base64,", drapeMode: "terrain" };
  const whole = { id: "whole", bbox: big.bbox, dataUrl: "data:image/png;base64,", drapeMode: "terrain" };
  const group = new THREE.Group(), cache = {};
  syncRasterDrapes(group, cache, [whole, part], { origin: bigOrigin, terrain: big, renderer: null });
  for (const id of ["whole", "part"]) {
    const mesh = cache[id];
    assert.equal(mesh.geometry.userData.drapeOn, "adaptive mesh");
    assert.ok(mesh.geometry.index.count / 3 <= tmesh.geometry.index.count / 3 + 4 * 600, "no more triangles than the terrain's (plus the clipped edge pieces)");
    mesh.updateMatrixWorld(true);
    const [bx0, by0, bx1, by1] = cache[id] === cache.part ? part.bbox : whole.bbox;
    let n = 0, lo = Infinity, hi = -Infinity;
    for (let s = 0; s < 40; s++) { // a ray through a 96,000-node mesh is slow: 40 points a drape
      const x = bx0 + 3 + ((s * 7919) % 1000) / 1000 * (bx1 - bx0 - 6), y = by0 + 3 + ((s * 104729) % 997) / 997 * (by1 - by0 - 6);
      const g = ray(tmesh, x, y), d = ray(mesh, x, y);
      if (!Number.isFinite(g)) continue; // over a no-data hole: no ground drawn there
      assert.ok(Number.isFinite(d), `the drape covers the drawn ground at ${x.toFixed(0)}, ${y.toFixed(0)}`);
      n++; lo = Math.min(lo, d - g); hi = Math.max(hi, d - g);
    }
    assert.ok(n > 25, `${id}: ${n} points`);
    assert.ok(Math.abs(lo - 0.15) < 0.01 && Math.abs(hi - 0.15) < 0.01, `${id}: the drape is 0.15 m above the drawn terrain everywhere (${lo.toFixed(3)} to ${hi.toFixed(3)} m)`);
  }
  // the part's clipped edges: its vertices stay inside its box, and its UVs inside 0..1
  const pg = cache.part.geometry, uv = pg.getAttribute("uv");
  for (let q = 0; q < uv.count; q++) assert.ok(uv.getX(q) >= -1e-6 && uv.getX(q) <= 1 + 1e-6 && uv.getY(q) >= -1e-6 && uv.getY(q) <= 1 + 1e-6);
});

test("adaptiveDrape: a box over one triangle's corner is clipped on that triangle's plane", () => {
  // two triangles over a 2 x 2 grid (nodes 0..3, 100 m apart; row 0 north): a plane z = x / 10 + y / 20
  const t = { bbox: [0, 0, 100, 100], gridW: 2, gridH: 2, elevations: Float32Array.from([0 + 100 / 20, 10 + 100 / 20, 0, 10]) };
  const d = adaptiveDrape(t, { vertexIds: Uint32Array.from([0, 1, 2, 3]), indices: Uint32Array.from([0, 2, 1, 1, 2, 3]) }, [25, 30, 60, 70]);
  assert.ok(d.indices.length >= 6);
  for (let q = 0; q < d.x.length; q++) {
    assert.ok(d.x[q] >= 25 - 1e-9 && d.x[q] <= 60 + 1e-9 && d.y[q] >= 30 - 1e-9 && d.y[q] <= 70 + 1e-9, "inside the box");
    assert.ok(Math.abs(d.z[q] - (d.x[q] / 10 + d.y[q] / 20)) < 1e-9, "on the plane");
  }
  let area = 0; for (let k = 0; k < d.indices.length; k += 3) { const [a, b, c] = [d.indices[k], d.indices[k + 1], d.indices[k + 2]]; area += Math.abs((d.x[b] - d.x[a]) * (d.y[c] - d.y[a]) - (d.x[c] - d.x[a]) * (d.y[b] - d.y[a])) / 2; }
  assert.ok(Math.abs(area - 35 * 40) < 1e-6, `the box's whole area, once (${area})`);
});

test("wiring: the raster and map-layer drapes share terrainDrapeGeometry: the adaptive mesh's triangles, or the grid lifted per vertex", () => {
  const s = fs.readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /geometry = terrainDrapeGeometry\(terrain, r\.bbox, \{ cx, cy, oz, base: 0\.15 \}\);/);
  assert.match(s, /geometry = terrainDrapeGeometry\(terrain, bbox, \{ cx, cy, oz, base: lift \}\);/);
  assert.match(s, /if \(am\) \{ const d = adaptiveDrape\(terrain, am, bbox\);/);
  assert.match(s, /positions\[q \* 3 \+ 2\] = Z\[q\] - oz \+ base \+ \(L \? L\[q\] : 0\);/);
  assert.match(s, /const am = adaptiveMeshOf\(terrain\); \/\/ #3449/);
  assert.doesNotMatch(s, /extraLift/);
});

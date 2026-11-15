// TASKS.csv #3252 phase 2 — the 3D View's imagery detail tiles: the tile choice from the camera (screen-space error, culling, the cap) and the
// tiles' drape on the drawn ground, pinned as drapeLift3449 pins the raster drapes: a tile is the drawn terrain's own surface, 0.15 m above it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { chooseSceneTiles, tilesToDraw, pixelAtFor, lodTileMesh, SCENE_MAX_TILES } from "../src/lib/viewer/lodDrape.js";
import { syncTerrain } from "../src/lib/viewer/sceneBuilders.js";
import { adaptiveDrape, trianglesNear, terrainMeshElevation } from "../src/lib/viewer/terrainDrape.js";
import { buildAdaptiveTerrain } from "../src/lib/terrainMesh.js";
import { fillNoData, decodeNoDataMask, isNoData } from "../src/lib/demFill.js";
import { lodRoot, tileBox, tilePixelM, tileKey } from "../src/lib/lodTiles.js";

globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(v) {}, style: {} }), createElement: () => ({ getContext: () => null }) };

// an adaptive terrain (over 90,000 nodes): 320 x 300 nodes 20 m apart, mountains, no-data corners (as drapeLift3449's)
const AW = 320, AH = 300, AC = 20, araw = new Array(AW * AH);
for (let j = 0; j < AH; j++) for (let i = 0; i < AW; i++) {
  const x = i * AC, y = j * AC;
  araw[j * AW + i] = i + j < 40 || (AW - 1 - i) + (AH - 1 - j) < 40 ? NaN : 1500 + 500 * Math.sin(x / 900) * Math.cos(y / 700) + 120 * Math.sin(x / 300 + y / 410);
}
const afill = fillNoData(araw);
const big = { id: "t3252", bbox: [500000, 6000000, 500000 + (AW - 1) * AC, 6000000 + (AH - 1) * AC], gridW: AW, gridH: AH, elevations: Float32Array.from(afill.elevations), noDataMask: afill.noDataMask };
const origin = { x: (big.bbox[0] + big.bbox[2]) / 2, y: (big.bbox[1] + big.bbox[3]) / 2, z: 1500 };
const ray = (mesh, x, y) => { const h = new THREE.Raycaster(new THREE.Vector3(x - origin.x, 9000, -(y - origin.y)), new THREE.Vector3(0, -1, 0)).intersectObject(mesh, false)[0]; return h ? h.point.y + origin.z : NaN; };
// a NAIP-like raster over most of it: 0.6 m native, fetched at 2 m
const [x0, y0, x1, y1] = big.bbox;
const raster = { id: "naip", bbox: [x0 + 300, y0 + 250, x1 - 400, y1 - 350], pixelM: 2, opacity: 0.85, drapeMode: "terrain", lod: { source: "pattern", nativeM: 0.6 } };

test("trianglesNear: the drape over the nearby triangles is the drape over the whole mesh", () => {
  const mask = decodeNoDataMask(big.noDataMask);
  const am = buildAdaptiveTerrain(AW, AH, big.elevations, (k) => isNoData(mask, k), { maxTriangles: 160000 });
  for (const box of [[x0 + 1000, y0 + 900, x0 + 1640, y0 + 1540], [x1 - 333, y1 - 333, x1 + 50, y1 + 50], [x0 + 2000.5, y0 + 3000.25, x0 + 2010.5, y0 + 3010.25]]) {
    const a = adaptiveDrape(big, am, box), b = adaptiveDrape(big, trianglesNear(big, am, box), box);
    assert.equal(b.indices.length, a.indices.length, "the same triangles");
    const area = (d) => { let s = 0; for (let k = 0; k < d.indices.length; k += 3) { const [p, q, r] = [d.indices[k], d.indices[k + 1], d.indices[k + 2]]; s += Math.abs((d.x[q] - d.x[p]) * (d.y[r] - d.y[p]) - (d.x[r] - d.x[p]) * (d.y[q] - d.y[p])) / 2; } return s; };
    assert.ok(Math.abs(area(a) - area(b)) < 1e-6);
  }
});

test("a detail tile lies on the drawn adaptive terrain, 0.15 m above it everywhere: it never floats and never sinks", () => {
  const tg = new THREE.Group(), tmesh = syncTerrain(tg, null, big, { origin });
  assert.ok(tmesh.geometry.userData.adaptive);
  tmesh.updateMatrixWorld(true);
  const root = lodRoot(raster.bbox);
  // a deep tile in the middle, and one at the raster's edge (clipped)
  for (const [z, x, y] of [[4, 7, 6], [3, 7, 0], [5, 0, 13]]) {
    const box = tileBox(root, z, x, y), tile = { z, x, y, box, key: tileKey("s", z, x, y) };
    const m = lodTileMesh(big, origin, tile, raster, null);
    m.updateMatrixWorld(true);
    assert.equal(m.geometry.userData.drapeOn, "adaptive mesh", "the drapes' path, on the drawn mesh");
    const part = [Math.max(box[0], raster.bbox[0]), Math.max(box[1], raster.bbox[1]), Math.min(box[2], raster.bbox[2]), Math.min(box[3], raster.bbox[3])];
    let n = 0, lo = Infinity, hi = -Infinity;
    for (let s = 0; s < 30; s++) {
      const x_ = part[0] + 1 + ((s * 7919) % 1000) / 1000 * (part[2] - part[0] - 2), y_ = part[1] + 1 + ((s * 104729) % 997) / 997 * (part[3] - part[1] - 2);
      const g = ray(tmesh, x_, y_), d = ray(m, x_, y_);
      if (!Number.isFinite(g)) continue;
      assert.ok(Number.isFinite(d), `the tile covers the drawn ground at ${x_.toFixed(0)}, ${y_.toFixed(0)}`);
      n++; lo = Math.min(lo, d - g); hi = Math.max(hi, d - g);
    }
    assert.ok(n > 15, `${z}/${x}/${y}: ${n} points`);
    assert.ok(Math.abs(lo - 0.15) < 0.01 && Math.abs(hi - 0.15) < 0.01, `${z}/${x}/${y}: 0.15 m above the drawn terrain (${lo.toFixed(3)} to ${hi.toFixed(3)} m)`);
    // the picture's UVs: the tile's own box (u east, v north), so a clipped edge tile shows its own part of the picture
    const pos = m.geometry.getAttribute("position"), uv = m.geometry.getAttribute("uv"), v = new THREE.Vector3();
    for (let q = 0; q < pos.count; q += 97) {
      v.fromBufferAttribute(pos, q).applyMatrix4(m.matrixWorld);
      const wx = v.x + origin.x, wy = origin.y - v.z;
      assert.ok(Math.abs(uv.getX(q) - (wx - box[0]) / (box[2] - box[0])) < 1e-4 && Math.abs(uv.getY(q) - (wy - box[1]) / (box[3] - box[1])) < 1e-4);
    }
    assert.ok(m.renderOrder > 0 && m.renderOrder < 1, "over the fetched picture, under the map layers");
  }
});

test("a grid terrain (no adaptive mesh): the tile's vertices never under the ground", () => {
  const N = 120, C = 10, el = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) el[j * N + i] = 300 + 40 * Math.sin(i / 9) * Math.cos(j / 7);
  const t = { id: "g", bbox: [0, 0, (N - 1) * C, (N - 1) * C], gridW: N, gridH: N, elevations: el };
  const o = { x: 600, y: 600, z: 300 }, r = { bbox: [5, 5, 1180, 1180], pixelM: 2, lod: { nativeM: 0.5 }, opacity: 1 };
  const root = lodRoot(r.bbox), box = tileBox(root, 2, 1, 2);
  const m = lodTileMesh(t, o, { z: 2, x: 1, y: 2, box, key: "k" }, r, null);
  m.updateMatrixWorld(true);
  assert.equal(m.geometry.userData.drapeOn, "grid");
  const pos = m.geometry.getAttribute("position"), v = new THREE.Vector3();
  let lo = Infinity;
  for (let q = 0; q < pos.count; q++) { v.fromBufferAttribute(pos, q).applyMatrix4(m.matrixWorld); lo = Math.min(lo, v.y + o.z - terrainMeshElevation(t, v.x + o.x, o.y - v.z)); }
  assert.ok(lo >= 0.15 - 1e-3, `lowest vertex ${lo.toFixed(3)} m above the ground`);
});

// the tile choice with a stand-in camera: the screen pixel grows with the distance from a point, and a box is 'out of view' west of a line
const pixelFrom = (cx, cy, k, westOf = -Infinity) => (b) => {
  if (b[2] < westOf) return Infinity;
  const dx = Math.max(b[0] - cx, 0, cx - b[2]), dy = Math.max(b[1] - cy, 0, cy - b[3]);
  return Math.max(Math.hypot(dx, dy, 300), 1) * k; // the camera 300 m above
};

test("near the camera the tiles are fine, far ones coarse; nothing outside the view; never more than the cap", () => {
  const cx = (raster.bbox[0] + raster.bbox[2]) / 2, cy = (raster.bbox[1] + raster.bbox[3]) / 2;
  const c = chooseSceneTiles(raster, pixelFrom(cx, cy, 0.0012)); // about 1.2 mm a pixel per metre of distance (a 1,000 px tall view, 60 degrees)
  assert.ok(c.tiles.length > 4 && c.tiles.length <= SCENE_MAX_TILES);
  const near = c.tiles.find((t) => t.box[0] <= cx && cx <= t.box[2] && t.box[1] <= cy && cy <= t.box[3]);
  const far = c.tiles.reduce((a, t) => (Math.hypot((t.box[0] + t.box[2]) / 2 - cx, (t.box[1] + t.box[3]) / 2 - cy) > Math.hypot((a.box[0] + a.box[2]) / 2 - cx, (a.box[1] + a.box[3]) / 2 - cy) ? t : a));
  assert.ok(near && near.z > far.z, `near level ${near?.z}, far level ${far.z}`);
  // the near tile's pixel is within the split ratio of the screen's there (or it is the source's own)
  // the near tile is the finest drawn (here the 96-tile cap stops it at 0.69 m where the screen pixel is 0.36 m; a closer camera covers less)
  assert.equal(near.z, Math.max(...c.tiles.map((t) => t.z)));
  // a camera close over a small part: there the tiles reach the screen's pixel (within the split ratio) or the source's own
  const close = chooseSceneTiles(raster, pixelFrom(cx, cy, 0.0012, -Infinity), { maxTiles: 4000 });
  const cn = close.tiles.find((t) => t.box[0] <= cx && cx <= t.box[2] && t.box[1] <= cy && cy <= t.box[3]);
  const px = tilePixelM(close.root, cn.z), scr = pixelFrom(cx, cy, 0.0012)(cn.box);
  assert.ok(px <= 1.5 * scr + 1e-9 || cn.z === close.maxLevel, `close: tile ${px.toFixed(2)} m, screen ${scr.toFixed(2)} m`);
  // only tiles finer than the fetched 2 m picture
  for (const t of c.tiles) assert.ok(tilePixelM(c.root, t.z) < 2);
  // half the raster out of view: none of its tiles
  const half = chooseSceneTiles(raster, pixelFrom(cx, cy, 0.0012, cx));
  assert.ok(half.tiles.length && half.tiles.every((t) => t.box[2] >= cx));
  // a tight cap holds
  assert.ok(chooseSceneTiles(raster, pixelFrom(cx, cy, 0.0001), { maxTiles: 20 }).tiles.length <= 20);
  // at the source's own pixel it stops: never deeper than maxLevel
  assert.ok(chooseSceneTiles(raster, pixelFrom(cx, cy, 1e-7)).tiles.every((t) => t.z <= c.maxLevel));
  // far away (a coarse screen pixel): the fetched picture is enough, no tiles
  assert.equal(chooseSceneTiles(raster, () => 50).tiles.length, 0);
  assert.equal(chooseSceneTiles({ bbox: raster.bbox }, () => 1), null, "no source description: nothing");
});

test("a wanted tile not loaded yet is drawn by its nearest loaded parent, once", () => {
  const root = lodRoot(raster.bbox), chosen = { root, base: 2, tiles: [{ z: 5, x: 10, y: 8 }, { z: 5, x: 11, y: 8 }, { z: 5, x: 12, y: 8 }] };
  const have = new Set([tileKey("s", 4, 5, 4), tileKey("s", 5, 12, 8)]);
  const d = tilesToDraw(chosen, "s", (k) => have.has(k));
  assert.deepEqual(d.map((t) => t.key), [tileKey("s", 4, 5, 4), tileKey("s", 5, 12, 8)]);
});

test("pixelAtFor: a three.js camera culls the boxes behind it and grows the pixel with distance", () => {
  const cam = new THREE.PerspectiveCamera(60, 1.5, 1, 1e6);
  cam.position.set(0, 800, 0); cam.lookAt(0, 0, -1000); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const flat = { bbox: [-5000, -5000, 5000, 5000], gridW: 2, gridH: 2, elevations: new Float32Array(4) };
  const at = pixelAtFor(cam, 1000, { x: 0, y: 0, z: 0 }, flat);
  const nearP = at([-50, 950, 50, 1050]), farP = at([-50, 3950, 50, 4050]), behind = at([-50, -3050, 50, -2950]); // world north = -z in the scene
  assert.ok(Number.isFinite(nearP) && farP > nearP, `${nearP} < ${farP}`);
  assert.equal(behind, Infinity);
});

test("wiring: the 3D View ticks the detail tiles each frame and syncs them with the rasters; the drapes share one geometry path", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /lodDrapeRef\.current\?\.tick\(camera, mount\.clientHeight\)/);
  assert.match(v, /lodDrapeRef\.current\.sync\(\{ group: rasterGroupRef\.current, rasters, terrain, origin: originRef\.current/);
  const s = fs.readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /export function terrainDrapeGeometry\(terrain, bbox, \{ cx, cy, oz, base, uvBox = null, near = false \}\)/);
});

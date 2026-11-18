// TASKS.csv #3252 phase 4 — export at a chosen pixel size, 'Download for offline use', and Main's condition: the 'Detail tiles' switches and the
// frame-time budget
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { exportLevel, offlinePlan, TILE_DISK_BYTES } from "../src/lib/lodCompose.js";
import { lodRoot, tilePixelM } from "../src/lib/lodTiles.js";
import { createBudget, FRAME_BUDGET_MS } from "../src/lib/viewer/lodBudget.js";
import { gpuClass, terrainOffReason } from "../src/lib/viewer/detailTilesPref.js";

// a NAIP-like raster: 6,400 m square, fetched at 2 m, 0.6 m native
const raster = { bbox: [500000, 4000000, 506400, 4006400], pixelM: 2, lod: { source: "naip", nativeM: 0.6 } };
const root = lodRoot(raster.bbox); // 6,400 m: level z has 6400 / 2^z / 256 m pixels: 25, 12.5, 6.25, 3.125, 1.5625, 0.78125, 0.390625

test("the export level: the coarsest at most the pixel asked, never past the source's, coarser while the picture would pass 8,192 px", () => {
  const a = exportLevel(raster, 1);
  assert.equal(a.z, 5); assert.equal(a.pixelM, 0.78125); assert.equal(a.width, 8192); assert.equal(a.capped, false);
  const b = exportLevel(raster, 0.5);
  assert.equal(b.z, 5, "0.39 m would be 16,384 px: one level coarser"); assert.equal(b.capped, true);
  assert.equal(exportLevel(raster, 3).pixelM, 1.5625);
  assert.equal(exportLevel(raster, 0.1, 1e6).z, 6, "never finer than the source's own level");
  assert.ok(tilePixelM(root, 6) < 0.6 && tilePixelM(root, 5) > 0.6);
});

test("'Download for offline use': every level finer than the fetched picture, down to the pixel asked, and its size on this computer", () => {
  const p = offlinePlan(raster, 1);
  assert.deepEqual(p.levels, [4, 5], "1.6 m and 0.78 m (the fetched picture is 2 m: 3.1 m and coarser are not read)");
  assert.equal(p.tiles.length, 16 * 16 + 32 * 32);
  assert.equal(p.bytes, p.tiles.length * TILE_DISK_BYTES);
  const part = offlinePlan(raster, 1, [500000, 4000000, 501000, 4001000]);
  assert.ok(part.tiles.length < 40, `${part.tiles.length} tiles over a 1 km corner`);
});

// a simulated machine: a frame takes base ms plus c ms for each million triangles the tiles draw (a million at the full budget, loading in over the
// first 20 s, a few ms of jitter); returns the level it settles at and how long it spent at each
function simulate({ base, c, seconds = 300 }) {
  const b = createBudget();
  let t = 1000, seed = 7;
  const t0 = t, end = t + seconds * 1000, last = [];
  while (t < end) {
    const f = b.factor(), ramp = Math.min(1, 0.3 + (t - t0) / 28000), tris = 1e6 * f * ramp;
    b.setTris("drape", tris * 0.4); b.setTris("terrain", tris * 0.6);
    seed = (seed * 16807) % 2147483647;
    const ms = base + c * (tris / 1e6) + ((seed % 1000) / 1000 - 0.5) * 6;
    t += ms; b.sample(t, true);
    last.push(b.factor());
  }
  const tail = last.slice(-600);
  return { factor: b.factor(), min: Math.min(...tail), max: Math.max(...tail) };
}
test("the frame budget (#3518): it follows the tiles' own cost: heavy tiles on a fast machine are cut, a slow machine with cheap tiles keeps them", () => {
  // a fast machine, heavy tiles: 10 ms + 50 ms a million triangles = 60 ms: cut to a half (35 ms) or a quarter (22 ms)
  const heavy = simulate({ base: 10, c: 50 });
  assert.ok(heavy.factor <= 0.5 && heavy.factor >= 0.125, `heavy tiles cut to ${heavy.factor}`);
  // this laptop: 63 ms with no tiles at all, the tiles cost 2 ms a million: cutting saves under 2 ms, so the tiles are kept
  const slow = simulate({ base: 63, c: 2 });
  assert.equal(slow.factor, 1, `a slow machine kept all of them (it was cut to 0.125 by the whole-frame rule)`);
  assert.equal(slow.min, 1, "and did not hunt up and down at the end");
  // a light scene: nothing cut
  assert.equal(simulate({ base: 8, c: 10 }).factor, 1);
  // a slow machine WITH costly tiles (60 + 40 a million): halving saves 20 ms, so it is cut
  assert.ok(simulate({ base: 60, c: 40 }).factor < 1);
  assert.equal(FRAME_BUDGET_MS, 33);
});
test("the frame budget: idle frames are not counted, and the same frame from two callers counts once", () => {
  const b = createBudget();
  let t = 0;
  for (let i = 0; i < 100; i++) { t += 80; b.sample(t, false); }
  assert.equal(b.factor(), 1, "not moving: no samples");
  b.sample(t + 0.2, true);
  assert.equal(b.state().lastAt, t, "the same frame, from the second caller");
});

test("the terrain tiles start off on software / integrated graphics or 8 GB or less", () => {
  assert.equal(gpuClass("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)"), "software");
  assert.equal(gpuClass("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)"), "integrated");
  assert.equal(gpuClass("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"), null);
  assert.equal(gpuClass("ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"), "integrated");
  assert.equal(terrainOffReason({ gpu: null, memoryGB: 8 }), "memory");
  assert.equal(terrainOffReason({ gpu: null, memoryGB: 32 }), null);
  assert.equal(terrainOffReason({ gpu: "integrated", memoryGB: 32 }), "integrated");
});

test("wiring: the KMZ dialog's pixel size, the offline download, the Layout snapshot's tiles, the switches and the budget", () => {
  const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src("../src/components/ProjectKmzDialog.jsx"), /onExport\(new Set\(chosen\.map\(\(p\) => p\.key\)\), \{ lodPixelM:/);
  assert.match(src("../src/lib/projectKmzExport.js"), /dataUrlBytes\(finer\.get\(r\.id\) \|\| asKmz\(r\.dataUrl\)\)/);
  assert.match(src("../src/components/LodCacheLine.jsx"), /<LodOfflineDownload rasters=\{rasters\}/);
  assert.match(src("../src/components/MapsPlanView.jsx"), /planLodTiles\(r, viewBox, mpp, \{ maxTiles: CAPTURE_MAX_TILES \}\)/);
  const hk = src("../src/modules/viewer/useLodTiles.js");
  assert.match(hk, /enabled: prefs\.terrain/);
  assert.match(hk, /enabled: prefs\.imagery/);
  assert.match(src("../src/modules/viewer/TerrainCard.jsx"), /<DetailTilesToggle kind="terrain"/);
  assert.match(src("../src/modules/viewer/RastersTerrainSection.jsx"), /<DetailTilesToggle kind="imagery"/); // the raster rows: #3891
  assert.match(src("../src/lib/viewer/lodTerrain.js"), /TERRAIN_MAX_TILES \* factor/);
  assert.match(src("../src/lib/viewer/lodDrape.js"), /SCENE_MAX_TILES \* factor/);
});

import * as THREE from "three";
import { cameraHash } from "../src/lib/viewer/lodBudget.js";
test("cameraHash changes with a small move far from the origin (it is how the budget knows the camera is moving)", () => {
  const c = new THREE.PerspectiveCamera(60, 1.5, 1, 1e6);
  c.position.set(4000, 2500, -3000); c.lookAt(0, 0, 0); c.updateMatrixWorld(true);
  const a = cameraHash(c);
  c.position.x += 0.05; c.updateMatrixWorld(true);
  assert.notEqual(cameraHash(c), a);
});

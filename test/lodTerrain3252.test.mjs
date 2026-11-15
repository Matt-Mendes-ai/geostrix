// TASKS.csv #3252 phase 3 — terrain detail tiles in the 3D View, display only: which terrains get them, the tile mesh (65 x 65 nodes and a
// skirt), the drapes drawn on the tile's OWN surface (sharing its vertices: they can neither float nor sink), and the choice from the camera.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { terrainLodOf, terrainNodeM, patternHeights, terrainTileGeometry, quadsIn, createLodTerrain, terrainTileBox, DEM_NODES, DEM_CELLS } from "../src/lib/viewer/lodTerrain.js";
import { chooseSceneTiles } from "../src/lib/viewer/lodDrape.js";
import { terrainMeshElevation } from "../src/lib/viewer/terrainDrape.js";

globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(v) {}, style: {} }), createElement: () => ({ getContext: () => null }) };

const N = 201, C = 30;
const el = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) el[j * N + i] = 1000 + 300 * Math.sin(i / 30) * Math.cos(j / 25);
const terrain = { id: "t3252p3", bbox: [400000, 6200000, 400000 + (N - 1) * C, 6200000 + (N - 1) * C], gridW: N, gridH: N, elevations: el, color: "#8a7f68" };
const origin = { x: 403000, y: 6203000, z: 1000 };

test("which terrains get tiles: AWS Terrain Tiles read again at their deepest zoom (in a real CRS), a test source, never a coarser one", () => {
  const aws = { ...terrain, source: { service: "AWS Terrain Tiles (Terrarium): SRTM blended with national DEMs", zoom: 11, sourcePixelM: 60, nodeM: 30 } };
  const l = terrainLodOf(aws, 32609);
  assert.equal(l.source, "aws");
  assert.equal(l.nativeM, 60 / 8, "zoom 14 is three zooms finer than 11");
  assert.equal(terrainLodOf(aws, null), null, "a local grid: no tiles");
  assert.equal(terrainLodOf({ ...aws, source: { ...aws.source, zoom: 14, sourcePixelM: 40 } }, 32609), null, "the saved grid (30 m) already finer than the source (40 m)");
  assert.equal(terrainLodOf({ ...terrain, source: { service: "Copernicus GLO-30" } }, 32609), null, "another source: none (yet)");
  assert.equal(terrainLodOf({ ...terrain, lod: { source: "pattern", nativeM: 2 } }, null).source, "pattern");
  assert.equal(terrainNodeM(terrain), 30);
});

test("a tile: 65 x 65 nodes at its heights, and a skirt hanging below its edges", () => {
  const box = terrainTileBox(terrain, 3, 2, 5);
  const h = patternHeights(terrain, box);
  assert.equal(h.length, DEM_NODES * DEM_NODES);
  // the pattern is the saved ground plus a ripple of at most 6 m
  for (let k = 0; k < h.length; k += 97) {
    const i = k % DEM_NODES, j = Math.floor(k / DEM_NODES), x = box[0] + (i * (box[2] - box[0])) / DEM_CELLS, y = box[3] - (j * (box[3] - box[1])) / DEM_CELLS;
    assert.ok(Math.abs(h[k] - terrainMeshElevation(terrain, x, y)) <= 6 + 1e-3);
  }
  const { geometry, wx, wy, gridTris } = terrainTileGeometry(h, box, origin, 20);
  const pos = geometry.getAttribute("position");
  assert.equal(gridTris, DEM_CELLS * DEM_CELLS * 6);
  assert.equal(pos.count, DEM_NODES * DEM_NODES + 2 * 4 * DEM_CELLS, "the grid, and the skirt's own top and bottom rows");
  for (let k = 0; k < DEM_NODES * DEM_NODES; k += 113) {
    assert.ok(Math.abs(pos.getY(k) + origin.z - h[k]) < 1e-3, "a node at its height");
    assert.ok(Math.abs(pos.getX(k) + origin.x - wx[k]) < 1e-3 && Math.abs(origin.y - pos.getZ(k) - wy[k]) < 1e-3);
  }
  // the skirt: each edge node repeated 20 m lower
  for (let q = DEM_NODES * DEM_NODES + 4 * DEM_CELLS; q < pos.count; q += 17) {
    const k = [...Array(DEM_NODES * DEM_NODES).keys()].find((n) => wx[n] === wx[q] && wy[n] === wy[q]);
    assert.ok(Math.abs(pos.getY(k) - pos.getY(q) - 20) < 1e-3);
  }
  assert.equal(geometry.index.count, gridTris + 4 * DEM_CELLS * 6);
});

test("a drape on a terrain tile is drawn on the tile's own vertices (the same position attribute: no lift, no gap), only over its box", async () => {
  const lt = createLodTerrain({ read: async (box) => patternHeights(terrain, box) });
  const group = new THREE.Group(), rasterGroup = new THREE.Group();
  const rasterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.Texture(), transparent: true, opacity: 0.8 }));
  rasterGroup.add(rasterMesh);
  const terrainMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial());
  const raster = { id: "r1", bbox: [401000, 6201000, 404000, 6204000], drapeMode: "terrain", visible: true };
  const t = { ...terrain, lod: { source: "pattern", nativeM: 1 } };
  let woke = 0;
  lt.sync({ group, terrain: t, terrainMesh, epsg: 32609, origin, rasters: [raster], rasterCache: { r1: rasterMesh }, mapLayers: [], mapLayerCache: {}, lodDrape: () => null, wake: () => { woke++; } });
  const cam = new THREE.PerspectiveCamera(60, 1.5, 1, 1e6);
  cam.position.set(0, 600, 0); cam.lookAt(0, 0, -800); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const tickUntil = async () => { for (let k = 0; k < 40; k++) { lt.tick(cam, 900); await new Promise((r) => setTimeout(r, 160)); if (lt.stats().tiles > 0 && lt.stats().loading === 0) { lt.tick(cam, 900); await new Promise((r) => setTimeout(r, 160)); lt.tick(cam, 900); break; } } };
  await tickUntil();
  const s = lt.stats();
  assert.ok(s.tiles > 0 && woke > 0, `${s.tiles} tiles`);
  assert.ok(s.finestM < terrainNodeM(terrain), `finer than the saved grid: ${s.finestM} m`);
  // the saved terrain and the raster's own drape are hidden where a tile is (stencil bit 2), the tile's twin writes it
  assert.equal(terrainMesh.material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(terrainMesh.material.stencilFuncMask, 2);
  assert.equal(rasterMesh.material.stencilFuncMask, 3, "the fetched picture: hidden under terrain tiles and imagery tiles");
  let overlays = 0;
  for (const ground of group.children) {
    const mark = ground.children.find((c) => c.userData.lodMark);
    assert.ok(mark && mark.material.stencilWriteMask === 2 && mark.renderOrder < 0 && mark.material.colorWrite === false);
    for (const ov of ground.children.filter((c) => c.userData.lodOverlay)) {
      overlays++;
      assert.equal(ov.geometry.getAttribute("position"), ground.geometry.getAttribute("position"), "the drape is the tile's own surface");
      assert.ok(ov.material.polygonOffset && ov.material.polygonOffsetFactor < 0, "ahead of the ground in the depth test, not lifted");
      assert.ok(ov.geometry.index.count <= DEM_CELLS * DEM_CELLS * 6, "never the skirt");
      // its UVs: the raster's box (u east, v north) at the tile's vertices
      const uv = ov.geometry.getAttribute("uv"), p = ground.geometry.getAttribute("position");
      for (let q = 0; q < 4225; q += 211) {
        const wx = p.getX(q) + origin.x, wy = origin.y - p.getZ(q);
        assert.ok(Math.abs(uv.getX(q) - (wx - raster.bbox[0]) / 3000) < 1e-4 && Math.abs(uv.getY(q) - (wy - raster.bbox[1]) / 3000) < 1e-4);
      }
    }
  }
  assert.ok(overlays > 0, `${overlays} drapes on the tiles`);
  lt.dispose();
  assert.equal(group.children.length, 0);
});

test("quadsIn: only the quads that meet the box", () => {
  const box = [0, 0, 640, 640];
  assert.equal(quadsIn(box, [0, 0, 640, 640]).length, DEM_CELLS * DEM_CELLS * 6);
  assert.equal(quadsIn(box, [12, 12, 18, 18]).length, 6, "one quad");
  assert.equal(quadsIn(box, [12, 12, 25, 18]).length, 12, "two quads");
});

test("the choice for terrain tiles: 64 cells a tile, near finer than far, stops at the source's spacing", () => {
  const pseudo = { bbox: terrain.bbox, lod: { nativeM: 2 }, pixelM: 30 };
  const near = [401000, 6201000];
  const at = (b) => { const dx = Math.max(b[0] - near[0], 0, near[0] - b[2]), dy = Math.max(b[1] - near[1], 0, near[1] - b[3]); return Math.max(Math.hypot(dx, dy, 200), 1) * 0.0013; };
  const c = chooseSceneTiles(pseudo, at, { maxTiles: 64, ratio: 6, tilePx: 64 });
  assert.ok(c.tiles.length > 1 && c.tiles.length <= 64);
  assert.ok(c.tiles.every((t) => c.pxM(t.z) < 30), "only tiles finer than the saved grid");
  const nearT = c.tiles.find((t) => t.box[0] <= near[0] && near[0] <= t.box[2] && t.box[1] <= near[1] && near[1] <= t.box[3]);
  assert.equal(nearT.z, Math.max(...c.tiles.map((t) => t.z)));
  assert.ok(c.tiles.every((t) => t.z <= c.maxLevel) && c.pxM(c.maxLevel) <= 2.0 + 1e-9 && c.pxM(c.maxLevel) > 1);
});

test("wiring: lazy, after the imagery tiles; the map layers keep their drape box", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const hk = fs.readFileSync(new URL("../src/modules/viewer/useLodTiles.js", import.meta.url), "utf8");
  assert.ok(hk.includes('import("../../lib/viewer/lodTerrain.js")') && !/^import .*lodTerrain\.js/m.test(v));
  assert.match(hk, /drapeRef\.current\?\.tick\(camera, h\); terrainRef\.current\?\.tick\(camera, h\);/);
  const s = fs.readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8");
  assert.match(s, /drapeOnTerrain \? \{ drapeBox: bbox \} : \{\}/);
});

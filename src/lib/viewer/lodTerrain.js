// TASKS.csv #3252 phase 3 (docs/ideas/lod-drape.md 3.1-3.5; Matt's decisions) — terrain detail tiles in the 3D View, display only. A terrain
// whose source can be read by window (AWS Terrain Tiles, read again at the zoom a tile needs) gets 65 x 65-node tiles of a quadtree over its box
// in the project CRS, chosen from the camera as the imagery tiles are (lodDrape.js chooseSceneTiles, 64 cells a tile: split while a node spacing
// is over TERRAIN_SPLIT_PX screen pixels), each with a skirt (a strip hanging down from its edges that hides the cracks between neighbours at
// different levels). The saved terrain grid stays what everything else reads (collar checks, sections, mine design, draping by numbers): the
// tiles are for the eye, and a collar can look a few metres off the finer ground (doc 3.5).
// The same drape rules: whatever is draped on the terrain (the terrain-draped rasters, their imagery detail tiles, the draped map layers) is
// drawn on each terrain tile's OWN triangles (overlays sharing its vertices, polygon-offset, no lift), so nothing floats above the finer ground
// or sinks into it. Where a terrain tile is drawn, the saved terrain and those drapes are hidden by the stencil (bit 2; bit 1 is the imagery
// tiles', #3509): each tile's twin writes it before anything else is drawn.
import * as THREE from "three";
import { lodRoot, tileBox, tileKey, TileLru } from "../lodTiles.js";
import { chooseSceneTiles, tilesToDraw, pixelAtFor } from "./lodDrape.js";
import { terrainMeshElevation } from "./terrainDrape.js";

export const DEM_CELLS = 64, DEM_NODES = DEM_CELLS + 1;
export const TERRAIN_SPLIT_PX = 6; // a node spacing over 6 screen pixels: split
export const TERRAIN_MAX_TILES = 64; // 64 tiles of 4,225 nodes (with skirts about 290,000 triangles), about the cost of a 513-node grid
export const DEM_MEMORY_BYTES = 64 * 1024 * 1024; // the decoded tiles held (17 KB each: about 3,800)
const FETCHING = 4, RETRY_MS = 60 * 1000, TICK_MS = 150;
const AWS_MAX_ZOOM = 14; // srtmFetch.js MAX_ZOOM: Terrarium tiles stop about there

// The terrain's own node spacing (the saved grid's)
export const terrainNodeM = (t) => Math.max((t.bbox[2] - t.bbox[0]) / Math.max(1, t.gridW - 1), (t.bbox[3] - t.bbox[1]) / Math.max(1, t.gridH - 1));
// What tiles a terrain can have: its lod (a test source), or one read again from AWS Terrain Tiles at their deepest zoom. null: none (another
// source, a local grid, or the saved grid already as fine as the source). -> { source, nativeM, epsg }
export function terrainLodOf(terrain, epsg) {
  if (!terrain?.bbox || !(terrain.gridW > 1)) return null;
  const node = terrainNodeM(terrain);
  let lod = null;
  if (terrain.lod?.source && terrain.lod.nativeM > 0) lod = { ...terrain.lod };
  else {
    const s = terrain.source || {};
    if (/^AWS Terrain Tiles/.test(String(s.service || "")) && s.sourcePixelM > 0 && Number.isFinite(s.zoom)) lod = { source: "aws", nativeM: s.sourcePixelM / 2 ** (AWS_MAX_ZOOM - s.zoom) };
  }
  if (!lod || !(lod.nativeM < node * 0.99)) return null;
  if (lod.source === "aws" && !(Number(epsg) > 0)) return null; // the tiles are read through the project CRS
  return { ...lod, epsg: Number(epsg) || null };
}

// ---- reading a tile: 65 x 65 heights over its box, row 0 north ----
// "pattern": the saved terrain (its drawn triangles) plus a ripple of a few metres, so the tiles can be checked live without a network
export function patternHeights(terrain, box) {
  const out = new Float32Array(DEM_NODES * DEM_NODES);
  const dx = (box[2] - box[0]) / DEM_CELLS, dy = (box[3] - box[1]) / DEM_CELLS;
  for (let j = 0; j < DEM_NODES; j++) for (let i = 0; i < DEM_NODES; i++) {
    const x = box[0] + i * dx, y = box[3] - j * dy;
    out[j * DEM_NODES + i] = terrainMeshElevation(terrain, x, y) + 6 * Math.sin(x / 23) * Math.cos(y / 31);
  }
  return out;
}
// "aws": the Terrarium tiles under the box at the zoom whose pixel is about the tile's node spacing, sampled at each node through the
// project CRS (bilinear, pixel centres, Mercator rows as srtmFetch.js does). A node off the tiles reads the saved terrain.
async function awsHeights(terrain, box, epsg) {
  const [{ decodeTerrariumTile, lonLatToTileXY, tileXYToLonLat }, { pointTransform }] = await Promise.all([import("../srtmFetch.js"), import("../reproject.js")]);
  const toLL = pointTransform(epsg, 4326);
  if (!toLL) throw new Error("no transform");
  const dx = (box[2] - box[0]) / DEM_CELLS, dy = (box[3] - box[1]) / DEM_CELLS;
  const ll = new Float64Array(DEM_NODES * DEM_NODES * 2);
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (let j = 0; j < DEM_NODES; j++) for (let i = 0; i < DEM_NODES; i++) {
    const p = toLL(box[0] + i * dx, box[3] - j * dy), k = (j * DEM_NODES + i) * 2;
    ll[k] = p[0]; ll[k + 1] = p[1];
    if (p[0] < lonMin) lonMin = p[0]; if (p[0] > lonMax) lonMax = p[0]; if (p[1] < latMin) latMin = p[1]; if (p[1] > latMax) latMax = p[1];
  }
  const latMid = ((latMin + latMax) / 2) * (Math.PI / 180), nodeM = Math.max(dx, dy);
  let zoom = AWS_MAX_ZOOM;
  while (zoom > 4 && (40075016.686 * Math.cos(latMid)) / (256 * 2 ** (zoom - 1)) <= nodeM) zoom--; // the coarsest zoom with a pixel at most a node
  const nw = lonLatToTileXY(lonMin, latMax, zoom), se = lonLatToTileXY(lonMax, latMin, zoom);
  const tx = se.x - nw.x + 1, ty = se.y - nw.y + 1;
  if (tx * ty > 9) throw new Error("too many source tiles");
  const mw = tx * 256, mh = ty * 256, mosaic = new Float32Array(mw * mh).fill(NaN);
  await Promise.all(Array.from({ length: tx * ty }, async (_, q) => {
    const a = q % tx, b = (q - a) / tx;
    try { const t = await decodeTerrariumTile(zoom, nw.x + a, nw.y + b); for (let r = 0; r < 256; r++) mosaic.set(t.data.subarray(r * 256, (r + 1) * 256), (b * 256 + r) * mw + a * 256); } catch { /* a missing source tile: those nodes read the saved terrain */ }
  }));
  const tl = tileXYToLonLat(nw.x, nw.y, zoom), br = tileXYToLonLat(se.x + 1, se.y + 1, zoom);
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const yTop = mercY(tl.lat), yBot = mercY(br.lat);
  const out = new Float32Array(DEM_NODES * DEM_NODES);
  for (let n = 0; n < out.length; n++) {
    const fx = ((ll[n * 2] - tl.lon) / (br.lon - tl.lon)) * mw - 0.5, fy = ((yTop - mercY(ll[n * 2 + 1])) / (yTop - yBot)) * mh - 0.5;
    const x0 = Math.max(0, Math.min(mw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(mh - 2, Math.floor(fy))), u = Math.min(1, Math.max(0, fx - x0)), v = Math.min(1, Math.max(0, fy - y0));
    const k = y0 * mw + x0, top = mosaic[k] + (mosaic[k + 1] - mosaic[k]) * u, bot = mosaic[k + mw] + (mosaic[k + mw + 1] - mosaic[k + mw]) * u;
    const z = top + (bot - top) * v;
    out[n] = Number.isFinite(z) ? z : terrainMeshElevation(terrain, box[0] + (n % DEM_NODES) * dx, box[3] - Math.floor(n / DEM_NODES) * dy);
  }
  return out;
}

// ---- the tile's meshes ----
// The ground: 65 x 65 nodes in scene coordinates and a skirt `skirtM` deep under its four edges. -> { geometry, wx, wy (world x / y of each
// vertex), gridTris (the triangles of the grid alone, not the skirt) }
export function terrainTileGeometry(heights, box, origin, skirtM) {
  const N = DEM_NODES, dx = (box[2] - box[0]) / DEM_CELLS, dy = (box[3] - box[1]) / DEM_CELLS;
  const ring = [];
  for (let i = 0; i < N; i++) ring.push(i); // north edge, west to east
  for (let j = 1; j < N; j++) ring.push(j * N + N - 1); // east edge, north to south
  for (let i = N - 2; i >= 0; i--) ring.push((N - 1) * N + i); // south edge, east to west
  for (let j = N - 2; j >= 1; j--) ring.push(j * N); // west edge, south to north
  // the skirt has its own vertices (a copy of each edge node and one below it), so its vertical faces do not darken the grid's normals at the edges
  const R = ring.length, nv = N * N + 2 * R, pos = new Float32Array(nv * 3), wx = new Float64Array(nv), wy = new Float64Array(nv);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = box[0] + i * dx, y = box[3] - j * dy;
    wx[k] = x; wy[k] = y;
    pos[k * 3] = x - origin.x; pos[k * 3 + 1] = heights[k] - origin.z; pos[k * 3 + 2] = -(y - origin.y);
  }
  ring.forEach((k, r) => {
    for (const [q, down] of [[N * N + r, 0], [N * N + R + r, skirtM]]) { wx[q] = wx[k]; wy[q] = wy[k]; pos[q * 3] = pos[k * 3]; pos[q * 3 + 1] = pos[k * 3 + 1] - down; pos[q * 3 + 2] = pos[k * 3 + 2]; }
  });
  const idx = [];
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i, b = a + 1, c = a + N, d = c + 1; idx.push(a, c, b, b, c, d); } // the terrain's diagonal (syncTerrain)
  const gridTris = idx.length;
  for (let r = 0; r < R; r++) { const a = N * N + r, b = N * N + ((r + 1) % R), a2 = a + R, b2 = b + R; idx.push(a, a2, b, b, a2, b2); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, wx, wy, gridTris };
}
// The triangles of the grid (not the skirt) whose quads meet `box`: an overlay draws only those
export function quadsIn(tileBox_, box) {
  const N = DEM_NODES, dx = (tileBox_[2] - tileBox_[0]) / DEM_CELLS, dy = (tileBox_[3] - tileBox_[1]) / DEM_CELLS;
  const i0 = Math.max(0, Math.floor((box[0] - tileBox_[0]) / dx)), i1 = Math.min(N - 2, Math.ceil((box[2] - tileBox_[0]) / dx) - 1);
  const j0 = Math.max(0, Math.floor((tileBox_[3] - box[3]) / dy)), j1 = Math.min(N - 2, Math.ceil((tileBox_[3] - box[1]) / dy) - 1);
  const idx = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = j * N + i, b = a + 1, c = a + N, d = c + 1; idx.push(a, c, b, b, c, d); }
  return idx;
}
// A drape (its texture over `box`, u east, v north) on a terrain tile's own surface: the tile's vertices, its own UVs, and every fragment outside
// the box discarded (no smear of the picture's edge across the rest of the quad)
function overlayMesh(tile, ov) {
  const idx = quadsIn(tile.box, ov.box);
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", tile.ground.geometry.getAttribute("position"));
  const n = tile.wx.length, uv = new Float32Array(n * 2), w = ov.box[2] - ov.box[0], h = ov.box[3] - ov.box[1];
  for (let k = 0; k < n; k++) { uv[k * 2] = (tile.wx[k] - ov.box[0]) / w; uv[k * 2 + 1] = (tile.wy[k] - ov.box[1]) / h; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.MeshBasicMaterial({ map: ov.texture, transparent: true, opacity: ov.opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - ov.layer, polygonOffsetUnits: -2 - ov.layer });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;\n#include <map_fragment>"); };
  m.customProgramCacheKey = () => "lodTerrainOverlay";
  if (ov.underImagery) { m.stencilWrite = true; m.stencilRef = 1; m.stencilFuncMask = 1; m.stencilFunc = THREE.NotEqualStencilFunc; m.stencilZPass = THREE.KeepStencilOp; } // #3509 on the tile too
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = ov.renderOrder;
  mesh.userData.lodOverlay = ov.key;
  return mesh;
}
// hide a material where a terrain tile is drawn (stencil bit 2); `alsoBit1`: the fetched picture of a raster, hidden under an imagery tile too
export function hideUnderTerrainTiles(material, alsoBit1 = false) {
  if (!material || material.userData?.lodTerrainHidden === (alsoBit1 ? 3 : 2)) return;
  material.stencilWrite = true; material.stencilRef = 0; material.stencilFuncMask = alsoBit1 ? 3 : 2; material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp; material.stencilZFail = THREE.KeepStencilOp; material.stencilZPass = THREE.KeepStencilOp;
  material.userData = { ...(material.userData || {}), lodTerrainHidden: alsoBit1 ? 3 : 2 };
  material.needsUpdate = true;
}

// One per 3D View: sync() with the scene's state, tick() from the render loop. ctx: { group, terrain, terrainMesh, epsg, origin, rasters,
// rasterCache, mapLayers, mapLayerCache, lodDrape: () => the imagery tiles' instance or null, wake }
export function createLodTerrain({ read = null } = {}) {
  let ctx = null, lod = null, dirty = true, lastAt = 0, camSig = "", dsigLast = "", store = null;
  const memory = new TileLru(DEM_MEMORY_BYTES, () => {});
  const queue = new Map(), running = new Set(), failedAt = new Map();
  const tiles = new Map(); // key -> { ground, mark, overlays: Map, sig, box, wx, wy }
  const st = { tiles: 0, wanted: 0, finestM: null, tickMs: 0, triangles: 0, memoryBytes: 0, loading: 0 };
  globalThis.__geostrixLodTerrainStats = st; // read-only numbers, for measuring the tiles live
  const srcKey = () => `dem-${lod.source}-${ctx.terrain.id}`;
  const readTile = read || (async (box) => (lod.source === "pattern" ? patternHeights(ctx.terrain, box) : lod.source === "aws" ? awsHeights(ctx.terrain, box, lod.epsg) : null));
  const dropOverlays = (t) => { for (const m of t.overlays.values()) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); } t.overlays.clear(); };
  const drop = (key) => { const t = tiles.get(key); if (!t) return; dropOverlays(t); t.ground.parent?.remove(t.ground); t.ground.geometry.dispose(); t.ground.material.dispose(); t.mark.geometry.dispose(); t.mark.material.dispose(); tiles.delete(key); };
  const dropAll = () => { for (const k of [...tiles.keys()]) drop(k); st.tiles = 0; st.triangles = 0; st.finestM = null; };
  const load = async (key, box) => {
    running.add(key);
    try {
      let h = null;
      try { // this computer's cache (the 2 GB IndexedDB store the imagery tiles use); a tile read without it still draws
        if (!store) store = await import("../lodTileStore.js");
        const blob = await store.getLodTile(key);
        if (blob) h = new Float32Array(await blob.arrayBuffer());
      } catch { /* no cache here */ }
      if (!h || h.length !== DEM_NODES * DEM_NODES) {
        h = await readTile(box);
        if (h) try { store?.putLodTile(key, new Blob([h.buffer])); } catch { /* no cache here */ }
      }
      memory.set(key, h || "empty", h ? h.byteLength : 16);
      failedAt.delete(key);
      dirty = true; ctx?.wake?.();
    } catch { failedAt.set(key, Date.now()); } finally { running.delete(key); pump(); }
  };
  const pump = () => { while (running.size < FETCHING && queue.size) { const [key, job] = queue.entries().next().value; queue.delete(key); load(key, job.box); } };
  return {
    sync(next) {
      const o = ctx?.origin, n = next?.origin;
      const same = ctx && ctx.terrain === next.terrain && ctx.group === next.group && o && n && o.x === n.x && o.y === n.y && o.z === n.z;
      if (!same) { dropAll(); memory.clear(); queue.clear(); }
      ctx = next; dirty = true;
      lod = terrainLodOf(ctx.terrain, ctx.epsg);
      if (!lod || ctx.terrain?.visible === false) dropAll();
    },
    tick(camera, viewportH) {
      if (!ctx || !lod || !ctx.terrain || ctx.terrain.visible === false || !(viewportH > 0)) return;
      const now = performance.now();
      if (now - lastAt < TICK_MS) return;
      const sig = `${camera.matrixWorld.elements.map((v) => v.toFixed(2)).join(",")}|${camera.projectionMatrix.elements[0].toFixed(4)}|${camera.zoom}|${viewportH}`;
      const drapeTiles = ctx.lodDrape?.()?.tileMeshes?.() || [];
      const dsig = drapeTiles.map((d) => d.key).join(";");
      if (!dirty && sig === camSig && dsig === dsigLast) return;
      lastAt = now; camSig = sig; dirty = false; dsigLast = dsig;
      const t0 = performance.now();
      const { group, terrain, origin } = ctx;
      const base = terrainNodeM(terrain);
      const pseudo = { bbox: terrain.bbox, lod: { nativeM: lod.nativeM }, pixelM: base };
      const chosen = chooseSceneTiles(pseudo, pixelAtFor(camera, viewportH, origin, terrain), { maxTiles: TERRAIN_MAX_TILES, ratio: TERRAIN_SPLIT_PX, tilePx: DEM_CELLS });
      const src = srcKey();
      const want = chosen?.tiles || [];
      st.wanted = want.length;
      // the queue: the wanted tiles not held, nearest the camera first
      const cam = camera.position, cx = cam.x + origin.x, cy = origin.y - cam.z;
      const jobs = [];
      for (const t of want) {
        const key = tileKey(src, t.z, t.x, t.y);
        if (memory.has(key) || running.has(key)) continue;
        const f = failedAt.get(key); if (f && Date.now() - f < RETRY_MS) continue;
        jobs.push({ key, box: t.box, d: Math.hypot((t.box[0] + t.box[2]) / 2 - cx, (t.box[1] + t.box[3]) / 2 - cy) });
      }
      jobs.sort((a, b) => a.d - b.d);
      queue.clear(); for (const j of jobs) queue.set(j.key, j);
      pump();
      st.loading = queue.size + running.size;
      const draw = chosen ? tilesToDraw(chosen, src, (k) => { const v = memory.get(k); return !!v && v !== "empty"; }) : [];
      const drawKeys = new Set(draw.map((t) => t.key));
      for (const k of [...tiles.keys()]) if (!drawKeys.has(k)) drop(k);
      // hide the saved terrain and the drapes on it where a tile is drawn
      hideUnderTerrainTiles(ctx.terrainMesh?.material);
      const rasterOv = [];
      (ctx.rasters || []).forEach((r) => {
        const mesh = ctx.rasterCache?.[r.id];
        if (!mesh || r.drapeMode !== "terrain" || !r.bbox || r.visible === false) return;
        hideUnderTerrainTiles(mesh.material, true);
        rasterOv.push({ key: `r:${r.id}:${mesh.material.map?.uuid}`, box: r.bbox, texture: mesh.material.map, opacity: mesh.material.opacity, layer: 0, renderOrder: 0.05, underImagery: !!r.lod });
      });
      const imgOv = drapeTiles.filter((d) => d.visible !== false && d.texture).map((d) => { hideUnderTerrainTiles(d.mesh.material); return { key: `i:${d.key}`, box: d.box, texture: d.texture, opacity: d.opacity, layer: 1, renderOrder: 0.1 + d.z / 100 }; });
      const mapOv = [];
      (ctx.mapLayers || []).forEach((l, li) => {
        const mesh = ctx.mapLayerCache?.[l.id];
        if (!mesh?.userData?.drapeBox || l.visible === false) return;
        hideUnderTerrainTiles(mesh.material);
        mapOv.push({ key: `m:${l.id}:${mesh.userData.styleKey}`, box: mesh.userData.drapeBox, texture: mesh.material.map, opacity: mesh.material.opacity, layer: 2 + li, renderOrder: 2 + li });
      });
      const overlaysAll = [...rasterOv, ...imgOv, ...mapOv];
      let tris = 0;
      for (const d of draw) {
        let t = tiles.get(d.key);
        if (!t) {
          const h = memory.get(d.key);
          const skirt = Math.max(2, (d.box[2] - d.box[0]) / 16);
          const { geometry, wx, wy, gridTris } = terrainTileGeometry(h, d.box, origin, skirt);
          const material = new THREE.MeshLambertMaterial({ color: terrain.color || "#8a7f68", side: THREE.DoubleSide, transparent: (terrain.opacity ?? 1) < 1, opacity: terrain.opacity ?? 1 });
          const ground = new THREE.Mesh(geometry, material);
          ground.userData = { lodTerrainTile: d.key, z: d.z, nodeM: (d.box[2] - d.box[0]) / DEM_CELLS };
          // the twin: stencil bit 2 where this tile is, drawn before anything else (no colour, no depth)
          const markGeo = new THREE.BufferGeometry(); markGeo.setAttribute("position", geometry.getAttribute("position")); markGeo.setIndex(Array.from(geometry.index.array.subarray(0, gridTris))); // the grid, not the skirt
          const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 2, stencilWriteMask: 2, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
          mark.renderOrder = -20; mark.userData.lodMark = true;
          ground.add(mark);
          group.add(ground);
          t = { ground, mark, overlays: new Map(), box: d.box, wx, wy, gridTris };
          tiles.set(d.key, t);
        }
        t.ground.material.opacity = terrain.opacity ?? 1;
        // the drapes on this tile's own surface
        const mine = overlaysAll.filter((ov) => ov.box[0] < t.box[2] && t.box[0] < ov.box[2] && ov.box[1] < t.box[3] && t.box[1] < ov.box[3]);
        const want_ = new Set(mine.map((ov) => ov.key));
        for (const [k, m] of t.overlays) if (!want_.has(k)) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); t.overlays.delete(k); }
        for (const ov of mine) {
          let m = t.overlays.get(ov.key);
          if (!m) { m = overlayMesh(t, ov); if (!m) continue; t.ground.add(m); t.overlays.set(ov.key, m); }
          m.material.opacity = ov.opacity;
          tris += m.geometry.index.count / 3;
        }
        tris += t.ground.geometry.index.count / 3;
      }
      st.tiles = tiles.size; st.triangles = tris; st.memoryBytes = memory.bytes;
      st.finestM = null; for (const t of tiles.values()) if (st.finestM == null || t.ground.userData.nodeM < st.finestM) st.finestM = t.ground.userData.nodeM;
      st.tickMs = performance.now() - t0;
    },
    stats: () => ({ ...st }),
    dispose() { dropAll(); memory.clear(); queue.clear(); ctx = null; },
  };
}

// the root of the terrain's quadtree and a tile's box, for tests
export const terrainTileBox = (terrain, z, x, y) => tileBox(lodRoot(terrain.bbox), z, x, y);

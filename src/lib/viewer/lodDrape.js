// TASKS.csv #3252 phase 2 (docs/ideas/lod-drape.md; Matt's decisions) — imagery detail tiles in the 3D View, over the existing terrain. A raster
// that carries a source description (raster.lod, phase 1) and is draped on the terrain gets 256 px tiles of a quadtree over its box in the
// project CRS, chosen from the camera each time it moves: a tile is split while one of its pixels would cover more than SPLIT_RATIO screen
// pixels at its nearest point (screen-space error), tiles outside the view are neither split nor drawn, and at most SCENE_MAX_TILES are kept.
// A wanted tile not loaded yet is drawn by its nearest loaded parent; the fetched picture stays underneath everywhere (and offline).
// Each tile is draped by the raster drapes' own path (sceneBuilders terrainDrapeGeometry, #3449): on a decimated terrain the drawn mesh's own
// triangles, on a grid terrain its nodes lifted per vertex, 0.15 m above the ground: a tile can neither float above it nor sink into it.
// The tiles are read by lib/lodTileLoader.js (the Maps plan's: memory, this computer's 2 GB cache, then the source), loaded on first use.
// Display only (doc 3.5): nothing here changes what the analysis reads.
import * as THREE from "three";
import { lodRoot, lodMaxLevel, tileBox, tilePixelM, lodSourceKey, tileKey, TILE_PX } from "../lodTiles.js";
import { terrainDrapeGeometry } from "./sceneBuilders.js";
import { terrainMeshElevation } from "./terrainDrape.js";

export const SCENE_MAX_TILES = 96; // 96 x 256 KB of texture (with mipmaps about 33 MB of GPU memory) at most per view
export const SPLIT_RATIO = 1.5; // a tile pixel over 1.5 screen pixels: split (the doc's 'about 1.5')
const TICK_MS = 150; // the choice is made at most this often, and only when the camera or the tiles changed

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const clipTo = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];

// Which tiles of one raster to draw. pixelAt(box) -> the metres a screen pixel covers at the box's nearest point, or Infinity when the box is
// out of view. The worst tile (its pixel over the screen's the most) is split first, until none is over `ratio` or `maxTiles` would be passed.
// -> { root, maxLevel, base, tiles: [{ z, x, y, box }] } (only tiles finer than the fetched picture, in view), or null (no source description)
// tilePx (TASKS.csv #3252 phase 3): the tile's cells a side (256 for imagery, 64 for terrain tiles), so the same choice serves both
export function chooseSceneTiles(raster, pixelAt, { maxTiles = SCENE_MAX_TILES, ratio = SPLIT_RATIO, tilePx = TILE_PX } = {}) {
  const nativeM = raster?.lod?.nativeM;
  if (!(nativeM > 0) || !raster.bbox) return null;
  const root = lodRoot(raster.bbox);
  const pxM = (z) => root.side / 2 ** z / tilePx;
  const maxLevel = tilePx === TILE_PX ? lodMaxLevel(root, nativeM) : Math.max(0, Math.ceil(Math.log2(root.side / (tilePx * nativeM)) - 1e-9));
  const base = raster.pixelM > 0 ? raster.pixelM : root.side / 4096;
  const clip = raster.bbox;
  const make = (z, x, y) => {
    const box = tileBox(root, z, x, y), m = pixelAt(clipTo(box, clip));
    return { z, x, y, box, err: Number.isFinite(m) && m > 0 ? pxM(z) / m : 0, seen: Number.isFinite(m) };
  };
  let leaves = [make(0, 0, 0)];
  for (;;) {
    let worst = -1;
    for (let k = 0; k < leaves.length; k++) { const l = leaves[k]; if (l.z < maxLevel && l.err > ratio && (worst < 0 || l.err > leaves[worst].err)) worst = k; }
    if (worst < 0) break;
    const p = leaves[worst], kids = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const c = make(p.z + 1, p.x * 2 + dx, p.y * 2 + dy); if (overlaps(c.box, clip) && c.seen) kids.push(c); }
    if (leaves.length - 1 + kids.length > maxTiles) break;
    leaves = [...leaves.slice(0, worst), ...kids, ...leaves.slice(worst + 1)];
  }
  return { root, maxLevel, base, pxM, tiles: leaves.filter((l) => l.seen && pxM(l.z) < base * 0.99).map(({ z, x, y, box }) => ({ z, x, y, box })) };
}

// The tiles to draw for the wanted ones: each wanted tile if it is loaded, else its nearest loaded parent finer than the fetched picture.
// loaded(key) -> true for a decoded picture (not an empty tile). -> [{ z, x, y, box, key }], each once, coarse first
export function tilesToDraw(chosen, src, loaded) {
  const out = new Map();
  for (const t of chosen.tiles) {
    let { z, x, y } = t;
    while (z >= 0 && (chosen.pxM ? chosen.pxM(z) : tilePixelM(chosen.root, z)) < chosen.base * 0.99) {
      const key = tileKey(src, z, x, y);
      if (loaded(key)) { if (!out.has(key)) out.set(key, { z, x, y, box: tileBox(chosen.root, z, x, y), key }); break; }
      z--; x >>= 1; y >>= 1;
    }
  }
  return [...out.values()].sort((a, b) => a.z - b.z);
}

// The screen pixel at a tile, from a three.js camera: the tile as a box (its ground heights sampled on the terrain), culled by the frustum
export function pixelAtFor(camera, viewportH, origin, terrain) {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const box3 = new THREE.Box3(), cam = camera.position;
  const persp = !!camera.isPerspectiveCamera;
  const k = persp ? (2 * Math.tan((camera.fov * Math.PI) / 360)) / viewportH : (camera.top - camera.bottom) / ((camera.zoom || 1) * viewportH);
  return (b) => {
    let lo = Infinity, hi = -Infinity;
    for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]]) {
      const z = terrainMeshElevation(terrain, x, y);
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    const pad = (b[2] - b[0]) * 0.1; // a ridge between the sampled points
    box3.min.set(b[0] - origin.x, lo - pad - origin.z, -(b[3] - origin.y));
    box3.max.set(b[2] - origin.x, hi + pad - origin.z, -(b[1] - origin.y));
    if (!frustum.intersectsBox(box3)) return Infinity;
    return persp ? Math.max(box3.distanceToPoint(cam), 1e-3) * k : k;
  };
}

// The tile's mesh: its picture on the terrain over the part of the tile inside the raster, by the drapes' own path
export function lodTileMesh(terrain, origin, tile, raster, texture) {
  const part = clipTo(tile.box, raster.bbox), cx = (part[0] + part[2]) / 2, cy = (part[1] + part[3]) / 2;
  const geometry = terrainDrapeGeometry(terrain, part, { cx, cy, oz: origin.z, base: 0.15, uvBox: tile.box, near: true }); // #3449's path: the drawn ground
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: raster.opacity ?? 0.85, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const m = new THREE.Mesh(geometry, material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx - origin.x, 0, -(cy - origin.y));
  m.renderOrder = 0.1 + tile.z / 100; // over the fetched picture (0) and coarser tiles, under the map layers (2 +) and the flat rasters
  // TASKS.csv #3509 — the fetched picture is hidden under a loaded tile (it showed through at the raster's opacity): the tile's twin writes
  // stencil 1 before anything transparent is drawn (no colour, no depth), and the fetched picture's mesh draws only where the stencil is not 1
  const mark = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilWriteMask: 1 /* bit 1: imagery tiles; bit 2: terrain tiles (#3252 phase 3) */, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, side: THREE.DoubleSide }));
  mark.renderOrder = -10; mark.userData.lodMark = true;
  m.add(mark);
  m.userData = { lodTile: tile.key, z: tile.z, pixelM: tilePixelM(lodRoot(raster.bbox), tile.z), box: tile.box };
  return m;
}

// One per 3D View: sync() with the scene's state when rasters / terrain / origin change, tick() from the render loop.
export function createLodDrape() {
  let ctx = null, loader = null, loading = false, dirty = true, lastAt = 0, camSig = "";
  const meshes = new Map(); // key -> mesh
  const st = { tiles: 0, gpuBytes: 0, finestM: null, tickMs: 0, wanted: 0 };
  globalThis.__geostrixLodStats = st; // read-only numbers, for measuring the tiles live (no data of the project)
  const drop = (key) => { const m = meshes.get(key); if (!m) return; m.parent?.remove(m); for (const c of m.children) c.material?.dispose?.(); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); meshes.delete(key); };
  const dropAll = () => { for (const k of [...meshes.keys()]) drop(k); st.tiles = 0; st.gpuBytes = 0; st.finestM = null; };
  const rastersOf = (c) => (c?.terrain && c.group ? (c.rasters || []).filter((r) => r.lod && r.bbox && r.drapeMode === "terrain" && r.visible !== false) : []);
  return {
    sync(next) {
      const o = ctx?.origin, n = next?.origin;
      const same = ctx && ctx.terrain === next.terrain && ctx.group === next.group && o && n && o.x === n.x && o.y === n.y && o.z === n.z;
      if (!same) dropAll(); // the tiles' heights and positions come from these
      ctx = next; dirty = true;
      const want = rastersOf(ctx).length > 0;
      if (!want) { dropAll(); return; }
      if (!loader && !loading) {
        loading = true;
        import("../lodTileLoader.js").then((m) => { loader = m; loading = false; dirty = true; ctx?.wake?.(); }).catch(() => { loading = false; });
      }
    },
    tick(camera, viewportH) {
      const list = rastersOf(ctx);
      if (!loader || !list.length || !(viewportH > 0)) return;
      const now = performance.now();
      if (now - lastAt < TICK_MS) return;
      const sig = `${camera.matrixWorld.elements.map((v) => v.toFixed(2)).join(",")}|${camera.projectionMatrix.elements[0].toFixed(4)}|${camera.zoom}|${viewportH}`;
      if (!dirty && sig === camSig) return;
      lastAt = now; camSig = sig; dirty = false;
      const t0 = performance.now();
      const { group, terrain, origin } = ctx, pixelAt = pixelAtFor(camera, viewportH, origin, terrain);
      const wanted = [], draw = new Map();
      const loaded = (k) => { const v = loader.lodTileImage(k); return !!v && !loader.isEmptyTile(v); };
      for (const r of list) {
        const base = ctx.cache?.[r.id]?.material; // #3509 — the fetched picture draws only where no tile does
        if (base && !base.stencilWrite) { base.stencilWrite = true; base.stencilRef = 1; base.stencilFunc = THREE.NotEqualStencilFunc; base.stencilFail = THREE.KeepStencilOp; base.stencilZFail = THREE.KeepStencilOp; base.stencilZPass = THREE.KeepStencilOp; base.needsUpdate = true; }
        const chosen = chooseSceneTiles(r, pixelAt);
        if (chosen) { st.maxLevel = chosen.maxLevel; st.wantedMaxZ = chosen.tiles.reduce((m, t) => Math.max(m, t.z), -1); st.nearestPixelM = chosen.tiles.reduce((m, t) => Math.min(m, pixelAt(t.box)), Infinity); }
        if (!chosen || !chosen.tiles.length) continue;
        const src = lodSourceKey(r);
        wanted.push({ src, lod: r.lod, tiles: chosen.tiles });
        for (const t of tilesToDraw(chosen, src, loaded)) draw.set(t.key, { ...t, r });
      }
      st.wanted = wanted.reduce((s, w) => s + w.tiles.length, 0);
      const cam = camera.position;
      loader.wantLodTiles(wanted, [cam.x + origin.x, origin.y - cam.z], () => { dirty = true; ctx?.wake?.(); });
      for (const k of [...meshes.keys()]) if (!draw.has(k)) drop(k);
      for (const [key, t] of draw) {
        let m = meshes.get(key);
        if (!m) {
          const img = loader.lodTileImage(key);
          const c = document.createElement("canvas"); c.width = TILE_PX; c.height = TILE_PX;
          c.getContext("2d").drawImage(img, 0, 0); // a copy: the memory cache may close its bitmap when it drops it
          const tex = new THREE.CanvasTexture(c);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
          m = lodTileMesh(terrain, origin, t, t.r, tex);
          group.add(m); meshes.set(key, m);
        }
        m.material.opacity = t.r.opacity ?? 0.85;
      }
      st.tiles = meshes.size;
      st.gpuBytes = Math.round((meshes.size * TILE_PX * TILE_PX * 4 * 4) / 3); // RGBA with mipmaps
      st.finestM = null;
      for (const x of meshes.values()) if (st.finestM == null || x.userData.pixelM < st.finestM) st.finestM = x.userData.pixelM; // no Math.min(...spread): #371
      st.tickMs = performance.now() - t0;
    },
    stats: () => ({ ...st, memoryBytes: loader?.lodMemory?.bytes ?? 0 }),
    // TASKS.csv #3252 phase 3 — the drawn tiles, for the terrain tiles to show on their own surface: [{ key, box, texture, opacity, z, mesh }]
    tileMeshes: () => [...meshes.values()].map((m) => ({ key: m.userData.lodTile, box: m.userData.box, texture: m.material.map, opacity: m.material.opacity, z: m.userData.z, mesh: m, visible: m.visible })),
    dispose() { dropAll(); ctx = null; },
  };
}

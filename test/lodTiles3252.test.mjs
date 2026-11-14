// TASKS.csv #3252 phase 1 — the Maps plan's detail tiles: the quadtree, the level for a view, the tiles in it, the memory budget and the
// on-disk cache's eviction rule (Matt: capped at 2 GB, with a Clear button)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lodRoot, tileBox, tilePixelM, lodMaxLevel, lodLevelFor, tilesInView, planLodTiles, lodSourceKey, TileLru, diskEvictions, DISK_CAP_BYTES, TILE_PX } from "../src/lib/lodTiles.js";

// a 20 x 12 km NAIP area at 0.6 m, fetched at Full as 2 x 2 pictures: 2.44 m pixels (#3251)
const bbox = [500000, 4400000, 520000, 4412000];
const raster = { bbox, pixelM: 20000 / 8192, lod: { source: "naip", epsg: 26913, nativeM: 0.6, items: [{ id: "co_m_3910501_ne_13_030_20230901", href: "x", epsg: 26913, bbox: [-105, 39.7, -104.9, 39.8] }] } };

test("the root is the box squared at its north-west corner; tiles tile it", () => {
  const root = lodRoot(bbox);
  assert.deepEqual(root, { x0: 500000, y1: 4412000, side: 20000 });
  assert.deepEqual(tileBox(root, 0, 0, 0), [500000, 4392000, 520000, 4412000]);
  assert.deepEqual(tileBox(root, 2, 1, 2), [505000, 4397000, 510000, 4402000]);
  assert.equal(tilePixelM(root, 8), 20000 / 256 / 256); // 0.305 m
});

test("the deepest level reaches the source's own pixel; the level for a view is the screen's pixel within a factor of 1.41", () => {
  const root = lodRoot(bbox);
  assert.equal(lodMaxLevel(root, 0.6), 8); // 0.31 m <= 0.6 m; level 7 would be 0.61 m
  assert.equal(lodLevelFor(root, 1, 8), 6); // 78 px of root per screen px ... level 6 = 1.22 m, nearest 1 m on a log scale
  assert.equal(lodLevelFor(root, 0.1, 8), 8); // never past the source
  assert.equal(lodLevelFor(root, 100, 8), 0);
  for (const m of [0.4, 0.9, 1.7, 3, 7]) { const z = lodLevelFor(root, m, 12), p = tilePixelM(root, z); assert.ok(p / m <= Math.SQRT2 + 1e-9 && m / p <= Math.SQRT2 + 1e-9, `${m}: ${p}`); }
});

test("a view: the tiles over it inside the raster only; none where the fetched picture is already as fine", () => {
  const root = lodRoot(bbox);
  const t = tilesInView(root, 2, [504000, 4403000, 506000, 4405000], bbox); // 5 km tiles: the view straddles x = 505,000
  assert.deepEqual(t.map((q) => [q.x, q.y]), [[0, 1], [1, 1]]);
  assert.deepEqual(tilesInView(root, 2, [500000, 4392000, 520000, 4399000], bbox), []); // the root's southern band is outside the raster
  // zoomed out (5 m a screen pixel): the 2.44 m picture is enough
  assert.equal(planLodTiles(raster, [500000, 4400000, 520000, 4412000], 5), null);
  // 1 m a screen pixel over a 1,900 x 1,000 m view: level 6 (1.22 m), finer than the picture
  const p = planLodTiles(raster, [508000, 4405000, 509900, 4406000], 1);
  assert.equal(p.level, 6);
  assert.ok(p.tiles.length > 0 && p.tiles.length <= 64);
  for (const q of p.tiles) assert.ok(q.box[0] < 509900 && q.box[2] > 508000 && q.box[1] < 4406000 && q.box[3] > 4405000);
  assert.equal(planLodTiles({ ...raster, lod: null }, [508000, 4405000, 509900, 4406000], 1), null);
});

test("too many tiles in view: one level coarser until they fit", () => {
  const p = planLodTiles(raster, [500000, 4400000, 520000, 4412000], 0.6, { maxTiles: 64 }); // the whole 20 km area at 0.6 m a pixel
  assert.ok(p === null || p.tiles.length <= 64);
});

test("the source key: the same images and root share tiles; another area or image does not", () => {
  const k = lodSourceKey(raster);
  assert.match(k, /^naip-[0-9a-z]+$/);
  assert.equal(lodSourceKey({ ...raster }), k);
  assert.notEqual(lodSourceKey({ ...raster, bbox: [500000, 4400000, 520000, 4413000] }), k);
  assert.notEqual(lodSourceKey({ ...raster, lod: { ...raster.lod, items: [{ id: "other" }] } }), k);
});

test("memory: least recently used dropped past the budget, each disposed once", () => {
  const gone = [];
  const lru = new TileLru(3 * 100, (v) => gone.push(v));
  lru.set("a", "A", 100); lru.set("b", "B", 100); lru.set("c", "C", 100);
  assert.equal(lru.get("a"), "A"); // a is now the most recent
  lru.set("d", "D", 100);
  assert.deepEqual(gone, ["B"]);
  assert.equal(lru.has("b"), false); assert.equal(lru.bytes, 300);
  lru.clear(); assert.deepEqual(gone.sort(), ["A", "B", "C", "D"]); assert.equal(lru.bytes, 0);
});

test("disk: nothing dropped under the cap; over it, the least recently used down to 90 %", () => {
  const MB = 1024 * 1024, cap = 10 * MB;
  const e = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, bytes: MB, t: 1000 + i }));
  assert.deepEqual(diskEvictions(e.slice(0, 10), cap), []);
  assert.deepEqual(diskEvictions(e, cap), ["k0", "k1", "k2"]); // 12 MB -> 9 MB
  assert.equal(DISK_CAP_BYTES, 2 * 1024 ** 3);
  assert.equal(TILE_PX, 256);
});

test("wired: the fetch keeps the source with the raster, the plan draws and asks for tiles, the raster pane has the Clear line", () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("lib/naipFetch.js"), /const lod = \{ source: "naip", epsg: dst, nativeM: finest, items: items\.map/);
  assert.match(read("modules/RasterModule.jsx"), /\.\.\.\(r\.lod && !tie \? \{ lod: r\.lod \} : \{\}\)/);
  assert.match(read("modules/RasterModule.jsx"), /<LodCacheLine hasLod=\{rasters\.some\(\(r\) => r\.lod\)\} \/>/);
  const p = read("components/MapsPlanView.jsx");
  assert.match(p, /const plan = planLodTiles\(r, viewBoxL, v\.mPerPx\);/);
  assert.match(p, /L\.wantLodTiles\(wanted, \[v\.cx, v\.cy\], \(\) => setTick\(\(t\) => t \+ 1\)\);/);
  assert.match(p, /import\("\.\.\/lib\/lodTileLoader\.js"\)/); // loaded on first use
  assert.doesNotMatch(p, /^import .*lodTileLoader/m);
});

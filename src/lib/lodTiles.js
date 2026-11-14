// TASKS.csv #3252 phase 1 (Matt's decisions in docs/ideas/lod-drape.md) — imagery at high resolution only where the Maps plan is looking.
// A fetched picture is at most 4,096 px a side (2 x 2 of them for NAIP, #3251): a 20 km NAIP area shows 2.4-5 m pixels where the imagery has
// 0.3-0.6 m. The raster keeps a description of its source (raster.lod: the images, their CRS, the finest pixel), and the plan reads 256 px
// tiles of a quadtree laid over the raster's box in the project CRS, at the level whose pixel matches the screen's, only where it looks.
// The fetched picture stays underneath (and is what the project file keeps); tiles are drawn over it once they arrive, coarse to fine.
// Pure: the quadtree, the choice of level and tiles, a least-recently-used memory budget, and the on-disk cache's eviction rule.

export const TILE_PX = 256;
export const MAX_TILES_IN_VIEW = 64; // more than this at the wanted level: one level coarser (a 1,920 x 1,080 view of 256 px tiles at the screen's pixel is about 45)
export const MEMORY_BUDGET_BYTES = 192 * 1024 * 1024; // decoded tiles held for drawing (RGBA, 256 KB each: about 750)
export const DISK_CAP_BYTES = 2 * 1024 ** 3; // Matt, #3252 decision 1: 2 GB on this computer, with a Clear button
export const DISK_TRIM_TO = 0.9; // past the cap, the least recently used tiles are dropped down to 90 % of it

// the quadtree's root: the raster's box squared, anchored at its north-west corner -> { x0, y1, side }
export function lodRoot(bbox) {
  const side = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  return { x0: bbox[0], y1: bbox[3], side };
}
// a tile's box [xmin, ymin, xmax, ymax]: level z has 2^z x 2^z tiles, x from the west, y from the north
export function tileBox(root, z, x, y) {
  const s = root.side / 2 ** z;
  return [root.x0 + x * s, root.y1 - (y + 1) * s, root.x0 + (x + 1) * s, root.y1 - y * s];
}
// the metres a tile pixel covers at level z
export const tilePixelM = (root, z) => root.side / 2 ** z / TILE_PX;
// the deepest level worth reading: its pixel reaches the source's own (nativeM)
export function lodMaxLevel(root, nativeM) {
  if (!(nativeM > 0) || !(root.side > 0)) return 0;
  return Math.max(0, Math.ceil(Math.log2(root.side / (TILE_PX * nativeM)) - 1e-9));
}
// the level whose pixel is nearest the screen's (mPerPx) on a log scale (within a factor of 1.41 of it), within 0 ... maxLevel
export function lodLevelFor(root, mPerPx, maxLevel) {
  if (!(mPerPx > 0)) return 0;
  return Math.min(maxLevel, Math.max(0, Math.round(Math.log2(root.side / (TILE_PX * mPerPx)))));
}
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
// the tiles of level z over viewBox, inside clipBox (the raster's own box) -> [{ z, x, y, box }]
export function tilesInView(root, z, viewBox, clipBox) {
  const n = 2 ** z, s = root.side / n;
  const box = [Math.max(viewBox[0], clipBox[0]), Math.max(viewBox[1], clipBox[1]), Math.min(viewBox[2], clipBox[2]), Math.min(viewBox[3], clipBox[3])];
  if (!(box[0] < box[2] && box[1] < box[3])) return [];
  const x0 = Math.max(0, Math.floor((box[0] - root.x0) / s)), x1 = Math.min(n - 1, Math.floor((box[2] - root.x0 - 1e-9) / s));
  const y0 = Math.max(0, Math.floor((root.y1 - box[3]) / s)), y1 = Math.min(n - 1, Math.floor((root.y1 - box[1] - 1e-9) / s));
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const b = tileBox(root, z, x, y); if (overlap(b, clipBox)) out.push({ z, x, y, box: b }); }
  return out;
}
// what the plan should read for one raster in this view -> { root, level, tiles, pixelM } or null when the fetched picture is already as fine
// as the screen (or as the source) needs. raster: { bbox, lod: { nativeM }, pixelM (the fetched picture's own pixel) }
export function planLodTiles(raster, viewBox, mPerPx, { maxTiles = MAX_TILES_IN_VIEW } = {}) {
  const nativeM = raster?.lod?.nativeM;
  if (!(nativeM > 0) || !raster.bbox) return null;
  const root = lodRoot(raster.bbox);
  const maxLevel = lodMaxLevel(root, nativeM);
  let level = lodLevelFor(root, mPerPx, maxLevel);
  const base = raster.pixelM > 0 ? raster.pixelM : root.side / 4096;
  if (tilePixelM(root, level) >= base * 0.99) return null; // the fetched picture is as fine as this level
  let tiles = tilesInView(root, level, viewBox, raster.bbox);
  while (tiles.length > maxTiles && level > 0) { level--; tiles = tilesInView(root, level, viewBox, raster.bbox); }
  if (tilePixelM(root, level) >= base * 0.99 || !tiles.length) return null;
  return { root, level, tiles, pixelM: tilePixelM(root, level) };
}

// the source a tile belongs to: the same images, CRS and root give the same tiles (a re-fetched picture of the same area shares them)
export function lodSourceKey(raster) {
  const l = raster?.lod;
  if (!l) return null;
  const s = JSON.stringify([l.source, l.epsg, (l.items || []).map((i) => i.id), lodRoot(raster.bbox)].flat().map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${l.source}-${h.toString(36)}`;
}
export const tileKey = (src, z, x, y) => `${src}/${z}/${x}/${y}`;

// a least-recently-used set of decoded tiles under a byte budget; dispose(value) is called on what is dropped
export class TileLru {
  constructor(budget = MEMORY_BUDGET_BYTES, dispose = (v) => v?.close?.()) { this.budget = budget; this.bytes = 0; this.map = new Map(); this.dispose = dispose; }
  get(k) { const e = this.map.get(k); if (!e) return undefined; this.map.delete(k); this.map.set(k, e); return e.value; }
  has(k) { return this.map.has(k); }
  set(k, value, bytes) {
    const old = this.map.get(k);
    if (old) { this.map.delete(k); this.bytes -= old.bytes; if (old.value !== value) this.dispose(old.value); }
    this.map.set(k, { value, bytes });
    this.bytes += bytes;
    for (const [key, e] of this.map) { if (this.bytes <= this.budget || key === k) break; this.map.delete(key); this.bytes -= e.bytes; this.dispose(e.value); }
  }
  clear() { for (const e of this.map.values()) this.dispose(e.value); this.map.clear(); this.bytes = 0; }
}

// the on-disk cache over its cap: which entries to drop, the least recently used first, down to trimTo x cap.
// entries: [{ key, bytes, t (last use, ms) }] -> [keys]
export function diskEvictions(entries, cap = DISK_CAP_BYTES, trimTo = DISK_TRIM_TO) {
  let total = 0;
  for (const e of entries) total += e.bytes;
  if (total <= cap) return [];
  const out = [];
  for (const e of [...entries].sort((a, b) => a.t - b.t)) { if (total <= cap * trimTo) break; out.push(e.key); total -= e.bytes; }
  return out;
}

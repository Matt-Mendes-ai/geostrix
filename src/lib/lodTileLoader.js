// TASKS.csv #3252 phase 1 — reads the Maps plan's detail tiles (lib/lodTiles.js) and keeps them for drawing. Loaded with the plan only when a
// raster carries a source description (raster.lod). A tile comes from memory, else from this computer (lodTileStore.js), else from the
// source: NAIP read by window from the Planetary Computer as the fetch itself reads it (naipFetch.js paintNaipRgba), at most FETCHING tiles
// at a time, nearest the view's centre first; what the view no longer needs is dropped from the queue. A tile the source cannot give
// (offline, a refused request) is not asked again for a minute, and the plan keeps the fetched picture there.
// The reads go through the main process (remoteSensingFetch), so they run here, not in a worker; each is a 256 px window (a few ms of
// decoding), and the picture is encoded once for the disk cache.
import { TileLru, tileKey, TILE_PX, MEMORY_BUDGET_BYTES } from "./lodTiles.js";
import { getLodTile, putLodTile } from "./lodTileStore.js";

const FETCHING = 4, RETRY_MS = 60 * 1000, TIFF_KEEP_MS = 40 * 60 * 1000; // a read token lasts about an hour
export const lodMemory = new TileLru(MEMORY_BUDGET_BYTES);
const queue = new Map(); // key -> job
const running = new Set(), failedAt = new Map(), listeners = new Set();
let lastError = null;
const status = () => ({ loading: queue.size + running.size, failed: [...failedAt.values()].filter((t) => Date.now() - t < RETRY_MS).length, lastError });
export function onLodStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const tell = () => { const s = status(); listeners.forEach((fn) => fn(s)); };

// the picture of a tile as a WebP Blob (null: nothing of the source there)
const tiffs = new Map(); // href -> { p, t }
async function openNaip(href) {
  const e = tiffs.get(href);
  if (e && Date.now() - e.t < TIFF_KEEP_MS) return e.p;
  const [{ openCog, signPc }, { NAIP_TOKEN }] = await Promise.all([import("./imageryFetch.js"), import("./naipFetch.js")]);
  const p = (async () => openCog(await signPc(href, NAIP_TOKEN)))();
  p.catch(() => tiffs.delete(href));
  tiffs.set(href, { p, t: Date.now() });
  return p;
}
const canvasOf = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const toBlob = (c) => new Promise((resolve) => c.toBlob((b) => resolve(b), "image/webp", 0.9));
async function readTile(lod, box) {
  const grid = { box, width: TILE_PX, height: TILE_PX, cell: (box[2] - box[0]) / TILE_PX };
  const c = canvasOf(TILE_PX, TILE_PX), ctx = c.getContext("2d");
  if (lod.source === "pattern") { // a drawn test pattern (no network), for checking the tiles, their levels and the cache live
    ctx.fillStyle = "rgba(30,90,160,0.35)"; ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    ctx.strokeStyle = "#0b3d6e"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, TILE_PX - 2, TILE_PX - 2);
    ctx.fillStyle = "#0b3d6e"; ctx.font = "bold 20px sans-serif"; ctx.fillText(`${(grid.cell).toPrecision(3)} m`, 12, 32);
    return toBlob(c);
  }
  if (lod.source !== "naip") return null;
  const { paintNaipRgba, gridLonLat } = await import("./naipFetch.js");
  const ll = gridLonLat(grid, lod.epsg);
  const items = (lod.items || []).filter((i) => i.bbox && i.bbox[0] < ll[2] && ll[0] < i.bbox[2] && i.bbox[1] < ll[3] && ll[1] < i.bbox[3]);
  if (!items.length) return null;
  const { rgba, painted } = await paintNaipRgba(grid, ll, items, lod.epsg, () => {}, { openTiff: openNaip });
  if (!painted) return null;
  ctx.putImageData(new ImageData(rgba, TILE_PX, TILE_PX), 0, 0);
  return toBlob(c);
}

const EMPTY = { empty: true }; // a tile with nothing of the source on it: remembered, not asked again
async function load(job) {
  const { key, lod, box, onReady } = job;
  running.add(key); tell();
  try {
    let blob = await getLodTile(key);
    if (!blob) {
      blob = await readTile(lod, box);
      if (blob) putLodTile(key, blob);
    }
    if (blob) { const bmp = await createImageBitmap(blob); lodMemory.set(key, bmp, TILE_PX * TILE_PX * 4); } else lodMemory.set(key, EMPTY, 64);
    failedAt.delete(key);
    onReady();
  } catch (err) {
    failedAt.set(key, Date.now());
    lastError = String(err?.message || err);
  } finally {
    running.delete(key);
    pump();
    tell();
  }
}
function pump() {
  while (running.size < FETCHING && queue.size) {
    const [key, job] = queue.entries().next().value;
    queue.delete(key);
    load(job);
  }
}

// the tiles one view wants, for every raster in it: [{ src, lod, tiles: [{ z, x, y, box }] }]; centre: [x, y] of the view. Replaces the
// queue (what is no longer wanted is not read); onReady is called as each tile arrives (the plan redraws)
export function wantLodTiles(wanted, centre, onReady) {
  const jobs = [];
  for (const w of wanted) for (const t of w.tiles) {
    const key = tileKey(w.src, t.z, t.x, t.y);
    if (lodMemory.has(key) || running.has(key)) continue;
    const f = failedAt.get(key);
    if (f && Date.now() - f < RETRY_MS) continue;
    const cx = (t.box[0] + t.box[2]) / 2, cy = (t.box[1] + t.box[3]) / 2;
    jobs.push({ key, lod: w.lod, box: t.box, onReady, d: Math.hypot(cx - centre[0], cy - centre[1]) });
  }
  jobs.sort((a, b) => a.d - b.d);
  queue.clear();
  for (const j of jobs) queue.set(j.key, j);
  pump();
  tell();
}
// the decoded tile, or EMPTY, or undefined (not loaded)
export const lodTileImage = (key) => lodMemory.get(key);
export const isEmptyTile = (v) => v === EMPTY;
// after Clear: what is in memory goes too, so the next view reads again
export function forgetLodTiles() { lodMemory.clear(); failedAt.clear(); queue.clear(); tiffs.clear(); tell(); }

// TASKS.csv #3252 phase 4 — one tile now, for an export or 'Download for offline use': from memory, this computer, else the source (and kept
// on this computer). -> the decoded picture (ImageBitmap), or null (nothing of the source there, or it could not be read)
export async function fetchLodTile(key, lod, box) {
  const have = lodMemory.get(key);
  if (have) return have === EMPTY ? null : have;
  let blob = await getLodTile(key);
  if (!blob) { blob = await readTile(lod, box); if (blob) await putLodTile(key, blob); }
  if (!blob) { lodMemory.set(key, EMPTY, 64); return null; }
  const bmp = await createImageBitmap(blob);
  lodMemory.set(key, bmp, TILE_PX * TILE_PX * 4);
  return bmp;
}
// the same, kept on this computer only (no picture decoded or held): for 'Download for offline use'. -> true when the source had something there
export async function storeLodTile(key, lod, box) {
  if (await getLodTile(key)) return true;
  const blob = await readTile(lod, box);
  if (blob) await putLodTile(key, blob);
  return !!blob;
}

// TASKS.csv #3252 phase 1 — the detail tiles on this computer (Matt's decision 1: capped at 2 GB, with a Clear button), so a field laptop
// shows the detail it has already looked at without a connection. Its own IndexedDB, apart from the basemap's (tileCache.js): clearing one
// never clears the other. Each entry keeps its picture (a WebP Blob), its size and when it was last used; past the cap the least recently
// used are dropped (lodTiles.js diskEvictions). Never throws: a cache that cannot be read or written just means the tile is fetched again.
import { DISK_CAP_BYTES, diskEvictions } from "./lodTiles.js";

const DB = "geostrix_lod_tiles", TILES = "tiles", META = "meta", TOTALS = "totals";
const TOUCH_MS = 60 * 60 * 1000; // a tile read again is marked used at most once an hour (a write per read would be wasteful)
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; db.createObjectStore(TILES); db.createObjectStore(META); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
const val = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

// -> Blob | null
export async function getLodTile(key) {
  try {
    const db = await open();
    const e = await val(db.transaction(TILES).objectStore(TILES).get(key));
    if (!e?.blob) return null;
    if (Date.now() - (e.t || 0) > TOUCH_MS) { const tx = db.transaction(TILES, "readwrite"); tx.objectStore(TILES).put({ ...e, t: Date.now() }, key); done(tx).catch(() => {}); }
    return e.blob;
  } catch { return null; }
}

let trimming = null;
export async function putLodTile(key, blob, { cap = DISK_CAP_BYTES } = {}) {
  try {
    const db = await open();
    const tx = db.transaction([TILES, META], "readwrite");
    const tiles = tx.objectStore(TILES), meta = tx.objectStore(META);
    const old = await val(tiles.get(key));
    tiles.put({ blob, bytes: blob.size, t: Date.now() }, key);
    const cur = (await val(meta.get(TOTALS))) || { count: 0, bytes: 0 };
    const next = { count: cur.count + (old ? 0 : 1), bytes: Math.max(0, cur.bytes + blob.size - (old?.bytes || 0)) };
    meta.put(next, TOTALS);
    await done(tx);
    if (next.bytes > cap && !trimming) trimming = trim(cap).finally(() => { trimming = null; });
  } catch { /* best effort */ }
}

// drops the least recently used tiles down to 90 % of the cap
async function trim(cap) {
  const db = await open();
  const entries = [];
  await new Promise((resolve, reject) => {
    const req = db.transaction(TILES).objectStore(TILES).openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) { resolve(); return; } entries.push({ key: c.key, bytes: c.value?.bytes || 0, t: c.value?.t || 0 }); c.continue(); };
    req.onerror = () => reject(req.error);
  });
  const drop = new Set(diskEvictions(entries, cap));
  if (!drop.size) return;
  const tx = db.transaction([TILES, META], "readwrite");
  let bytes = 0, count = 0;
  for (const e of entries) { if (drop.has(e.key)) tx.objectStore(TILES).delete(e.key); else { bytes += e.bytes; count++; } }
  tx.objectStore(META).put({ count, bytes }, TOTALS);
  await done(tx);
}

// -> { count, bytes }
export async function lodTileStats() {
  try { const db = await open(); return (await val(db.transaction(META).objectStore(META).get(TOTALS))) || { count: 0, bytes: 0 }; } catch { return { count: 0, bytes: 0 }; }
}
export async function clearLodTiles() {
  try {
    const db = await open();
    const tx = db.transaction([TILES, META], "readwrite");
    tx.objectStore(TILES).clear();
    tx.objectStore(META).put({ count: 0, bytes: 0 }, TOTALS);
    await done(tx);
  } catch { /* ignore */ }
}

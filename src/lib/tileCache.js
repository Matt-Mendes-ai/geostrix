// TASKS.csv #237 sub-item (5), the last item left open on that row: "no offline basemap tile
// pre-cache for field use without internet access." Matt's own drilling is in BC's Golden Triangle —
// exactly the kind of place a laptop has no signal — so the corner locator (LocatorMap.jsx) and full
// map picker (BasemapView.jsx) being 100% dependent on a live tile fetch every time means the basemap
// (and the "draw an SRTM fetch area" workflow that's built on top of it) simply goes blank in the
// field the moment there's no connection, even for an area the user has already looked at before.
//
// IndexedDB (not localStorage, which is far too small and string-only) holding raw tile image Blobs,
// keyed by "layerId/z/x/y". Two ways tiles land in here: (1) passively — CachedTile.jsx quietly stores
// every tile it ever displays, so simply having looked at an area once means it's available offline
// later, no explicit action needed; (2) actively — BasemapView's "Download this area for offline use"
// button walks a whole zoom range for the current viewport up front, for a deliberate "prep before I
// lose signal" pass. A tiny separate "meta" object store holds a running {count, bytes} total so the
// cache-size readout in LayerPicker.jsx doesn't need an O(n) full-store scan on every render.
const DB_NAME = "geostrix_tile_cache";
const DB_VERSION = 1;
const STORE = "tiles";
const META_STORE = "meta";
const META_KEY = "totals";

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tileKey(layerId, z, x, y) { return `${layerId}/${z}/${x}/${y}`; }

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function bumpMeta(deltaCount, deltaBytes) {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  const store = tx.objectStore(META_STORE);
  const cur = (await promisify(store.get(META_KEY))) || { count: 0, bytes: 0 };
  const next = { count: Math.max(0, cur.count + deltaCount), bytes: Math.max(0, cur.bytes + deltaBytes) };
  store.put(next, META_KEY);
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(next); tx.onerror = () => reject(tx.error); });
}

// Returns a Blob if this exact tile is already cached, else null. Never throws — a cache miss/error
// is always treated the same as "not cached", falling back to the normal network path.
export async function getCachedTile(layerId, z, x, y) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const blob = await promisify(tx.objectStore(STORE).get(tileKey(layerId, z, x, y)));
    return blob || null;
  } catch { return null; }
}

// Stores a tile Blob, skipping the write (and the meta-count bump) if this exact tile is already
// cached — repeat views of the same on-screen area shouldn't inflate the byte count.
export async function putCachedTile(layerId, z, x, y, blob) {
  try {
    const db = await openDb();
    const key = tileKey(layerId, z, x, y);
    const tx = db.transaction(STORE, "readwrite");
    const existing = await promisify(tx.objectStore(STORE).get(key));
    if (existing) return;
    tx.objectStore(STORE).put(blob, key);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    await bumpMeta(1, blob.size || 0);
  } catch { /* best-effort cache — a failed write just means this tile stays network-only */ }
}

// Fetches a tile over the network and caches it — shared by CachedTile.jsx's passive background
// caching and BasemapView's explicit area pre-download. Returns the Blob (for building an object URL)
// or null on any network failure (offline, 404, CORS, etc.) — callers already handle "no tile" the
// same way the plain <img onError> fallback always has.
export async function fetchAndCacheTile(layerId, z, x, y, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    await putCachedTile(layerId, z, x, y, blob);
    return blob;
  } catch { return null; }
}

export async function getCacheStats() {
  try {
    const db = await openDb();
    const tx = db.transaction(META_STORE, "readonly");
    const cur = await promisify(tx.objectStore(META_STORE).get(META_KEY));
    return cur || { count: 0, bytes: 0 };
  } catch { return { count: 0, bytes: 0 }; }
}

export async function clearTileCache() {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE, META_STORE], "readwrite");
    tx.objectStore(STORE).clear();
    tx.objectStore(META_STORE).put({ count: 0, bytes: 0 }, META_KEY);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  } catch { /* ignore — worst case the old cache just lingers */ }
}

export function formatCacheBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

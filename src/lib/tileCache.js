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
// TASKS.csv #300 follow-up (#302) — POISONED CACHE. OSM serves its "Access blocked — App is not
// following the tile usage policy" notice as a normal HTTP 200 PNG, not an error status, so while #300's
// User-Agent bug was live this cache happily stored 300+ copies of that placeholder as if they were map
// tiles. getCachedTile is checked BEFORE the network in CachedTile.jsx (the whole point of an offline
// cache), so fixing the User-Agent alone did NOT clear the screen: every already-cached blocked tile
// kept rendering from IndexedDB and would have done so indefinitely. Two defences:
//
// 1. BLOCKED_TILE_SHA256 below — the placeholder is one fixed image served for every z/x/y, so it has a
//    stable fingerprint. fetchAndCacheTile hashes each response and refuses to store a match, so a
//    future block (a fork without the UA, a policy change) can never poison the cache again. Belt and
//    braces rather than relying only on the one-time purge, which by definition only fires once.
// 2. DB_VERSION bump to 2 — the existing poison predates any detection, so it must simply be dropped.
//    IndexedDB's onupgradeneeded fires exactly once per browser profile, which is the right shape for a
//    one-time repair: clearing the store there costs the user only re-downloading tiles they look at
//    again, and leaves no way to be stuck looking at a cached "Access blocked" grid.
const BLOCKED_TILE_SHA256 = "b02c44252dac5a5e820ecef1e9bf9200e9407c042df668a466a1aa81a9ecca7a"; // 6,987-byte OSM block placeholder
const BLOCKED_TILE_BYTES = 6987; // cheap pre-filter so the common case never pays for a hash

const DB_NAME = "geostrix_tile_cache";
const DB_VERSION = 2; // was 1 — see the poisoned-cache note above
const STORE = "tiles";
const META_STORE = "meta";
const META_KEY = "totals";

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      // TASKS.csv #302 — one-time repair for caches filled while TASKS.csv #300's User-Agent bug was
      // live. Only on an actual upgrade from a previous version (oldVersion > 0); a brand-new cache has
      // nothing to repair. Uses the transaction onupgradeneeded already provides rather than opening a
      // second one, which would deadlock against this very upgrade.
      if (ev.oldVersion > 0 && ev.oldVersion < 2) {
        const tx = req.transaction;
        try {
          tx.objectStore(STORE).clear();
          tx.objectStore(META_STORE).put({ count: 0, bytes: 0 }, META_KEY);
        } catch { /* a failed repair just leaves the old cache; the hash check below still stops it being served */ }
      }
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
// TASKS.csv #302 — is this response the tile provider's "you are blocked" placeholder rather than a
// map tile? Size is checked first because it rules out virtually every real tile for free; the hash is
// only computed on an exact size match. Returns false if SubtleCrypto is unavailable (non-secure
// context) — better to cache a placeholder than to throw inside a tile fetch.
async function isBlockedPlaceholder(blob) {
  if (blob.size !== BLOCKED_TILE_BYTES) return false;
  try {
    if (!globalThis.crypto?.subtle) return false;
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === BLOCKED_TILE_SHA256;
  } catch { return false; }
}

export async function fetchAndCacheTile(layerId, z, x, y, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    // TASKS.csv #302 — never store (or display) a block placeholder. Returning null makes the caller
    // treat it as a missing tile, which renders as empty map rather than a wall of "Access blocked"
    // graphics — an honest blank is better than a screenful of someone else's error text.
    if (await isBlockedPlaceholder(blob)) return null;
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

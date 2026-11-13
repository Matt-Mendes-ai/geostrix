// TASKS.csv #2388 (review #2325, side 5's hand-off) — a short stamp of an interval log (the lithology the modelling read): its row count and
// a 32-bit FNV-1a hash of each row's hole_id, from, to and value, in order. A model run keeps the stamp of the log it read; when the log is
// replaced or edited the stamps differ and the model is marked as built from an older log. Not cryptographic: a change detector. Pure.
const FNV_OFFSET = 0x811c9dc5, FNV_PRIME = 0x01000193;

function mix(h, s) {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, FNV_PRIME); }
  h ^= 0x1f; return Math.imul(h, FNV_PRIME); // a separator, so "a|bc" and "ab|c" differ
}

// TASKS.csv #2945 — one stamp per log array: a GemPy result's landing stamped the 150,455-row log up to three times (40 ms each). The app
// replaces a log's array when it changes (the lithoNow memo already keys on it), so the array is the cache key.
const cache = new WeakMap();
export function layerStamp(rows) {
  if (rows && typeof rows === "object") { const hit = cache.get(rows); if (hit !== undefined) return hit; const v = stampOf(rows); cache.set(rows, v); return v; }
  return stampOf(rows);
}
function stampOf(rows) {
  let h = FNV_OFFSET, n = 0;
  for (const r of rows || []) {
    if (!r) continue;
    h = mix(h, String(r.hole_id ?? ""));
    h = mix(h, String(r.from ?? ""));
    h = mix(h, String(r.to ?? ""));
    h = mix(h, String(r.value ?? ""));
    n++;
  }
  return `${n}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

// stale: the model carries a stamp and it is not the log's now. A model made before stamps existed (no stamp) is unknown, never stale.
export const isStaleStamp = (stamp, current) => !!stamp && !!current && stamp !== current;

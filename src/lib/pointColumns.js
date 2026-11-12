// TASKS.csv #3008 (WA iron review) — sample points sent to the estimation worker as columns: a structured clone of 147,000 point objects
// cost the main thread about 0.9 s per run, twice (the estimate and its nearest-neighbour check). Numbers go as Float64Arrays (with a mask
// where a value was null), anything else as a plain array per field; the worker rebuilds the same objects. Kept per points array, so the
// second run reuses the first packing. Pure.
const packed = new WeakMap();

// points [{ ... }] -> { n, num: { key: Float64Array }, nulls: { key: Uint8Array }, other: { key: [] } }
export function packPoints(points) {
  if (packed.has(points)) return packed.get(points);
  const n = points.length, keys = new Set();
  for (const p of points) for (const k in p) keys.add(k);
  const num = {}, nulls = {}, other = {};
  for (const k of keys) {
    let numeric = true, anyNull = false;
    for (let i = 0; i < n; i++) { const v = points[i][k]; if (v == null) { anyNull = true; continue; } if (typeof v !== "number") { numeric = false; break; } }
    if (numeric) {
      const col = new Float64Array(n), mask = anyNull ? new Uint8Array(n) : null;
      for (let i = 0; i < n; i++) { const v = points[i][k]; if (v == null) { col[i] = NaN; mask[i] = v === undefined ? 2 : 1; } else col[i] = v; }
      num[k] = col; if (mask) nulls[k] = mask;
    } else other[k] = points.map((p) => p[k]);
  }
  const out = { n, num, nulls, other };
  packed.set(points, out);
  return out;
}

// the columns -> the same point objects (a field a point did not have stays absent; null stays null)
export function unpackPoints({ n, num, nulls, other }) {
  const out = new Array(n);
  const numKeys = Object.keys(num), otherKeys = Object.keys(other);
  for (let i = 0; i < n; i++) {
    const p = {};
    for (const k of numKeys) { const m = nulls[k]?.[i]; if (m === 2) continue; p[k] = m === 1 ? null : num[k][i]; }
    for (const k of otherKeys) { const v = other[k][i]; if (v !== undefined) p[k] = v; }
    out[i] = p;
  }
  return out;
}

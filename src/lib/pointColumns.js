// TASKS.csv #3008 (WA iron review) — sample points sent to the estimation worker as columns: a structured clone of 147,000 point objects
// cost the main thread about 0.9 s per run, twice (the estimate and its nearest-neighbour check). Numbers go as Float64Arrays (with a mask
// where a value was null), anything else as a plain array per field; the worker rebuilds the same objects. Kept per points array, so the
// second run reuses the first packing. Pure.
const packed = new WeakMap();

// TASKS.csv #3389 — a column of strings (hole_id, a domain code) goes as a table of its distinct values and an Int32Array of codes (-1: the field is
// absent, -2: null): a 147,601-element array of strings costs the structured clone about 10 times what the table and codes do.
const isStrCol = (points, k, a, e, st) => { for (let i = a; i < e; i++) { const v = points[i][k]; if (v != null && typeof v !== "string") { st.str = false; return; } } };
const encodeStr = (points, k, a, e, codes, map, table) => {
  for (let i = a; i < e; i++) {
    const v = points[i][k];
    if (v === undefined) codes[i] = -1; else if (v === null) codes[i] = -2;
    else { let c = map.get(v); if (c === undefined) { c = table.length; map.set(v, c); table.push(v); } codes[i] = c; }
  }
};

// points [{ ... }] -> { n, num: { key: Float64Array }, nulls: { key: Uint8Array }, other: { key: [] }, strs: { key: { table, codes } } }
export function packPoints(points) {
  if (packed.has(points)) return packed.get(points);
  const n = points.length, keys = new Set();
  for (const p of points) for (const k in p) keys.add(k);
  const num = {}, nulls = {}, other = {}, strs = {};
  for (const k of keys) {
    let numeric = true, anyNull = false;
    for (let i = 0; i < n; i++) { const v = points[i][k]; if (v == null) { anyNull = true; continue; } if (typeof v !== "number") { numeric = false; break; } }
    if (numeric) {
      const col = new Float64Array(n), mask = anyNull ? new Uint8Array(n) : null;
      for (let i = 0; i < n; i++) { const v = points[i][k]; if (v == null) { col[i] = NaN; mask[i] = v === undefined ? 2 : 1; } else col[i] = v; }
      num[k] = col; if (mask) nulls[k] = mask;
    } else {
      const st = { str: true };
      isStrCol(points, k, 0, n, st);
      if (st.str) { const codes = new Int32Array(n), table = []; encodeStr(points, k, 0, n, codes, new Map(), table); strs[k] = { table, codes }; }
      else other[k] = points.map((p) => p[k]);
    }
  }
  const out = { n, num, nulls, other, strs };
  packed.set(points, out);
  return out;
}

// TASKS.csv #3389 / #3403 (side session notes, from #3105 / #3111) — packPoints was one task of 0.35-0.4 s on 147,601 points (255 ms measured here),
// in the Estimation run's hand-off to its worker and the Variogram's. The same columns, built in slices of rows with a pause whenever a slice
// has run `budgetMs` (the window paints between them), so no task is long. Identical to packPoints' result and kept in the same per-array
// memo. The slice loops are plain functions, not inside the async one: a loop resumed after an await runs in slow code (measured 3-4 times
// slower). pause: awaited between slices; signal: aborted -> rejects with .cancelled.
const addKeys = (points, a, e, keys) => { for (let i = a; i < e; i++) for (const k in points[i]) keys.add(k); };
// 0 = every value so far a number or null, 1 = a null seen, 2 = not numeric (stop)
const scanSlice = (points, k, a, e, state) => { for (let i = a; i < e; i++) { const v = points[i][k]; if (v == null) { state.anyNull = true; continue; } if (typeof v !== "number") { state.numeric = false; return; } } };
const fillNum = (points, k, col, mask, a, e) => { for (let i = a; i < e; i++) { const v = points[i][k]; if (v == null) { col[i] = NaN; mask[i] = v === undefined ? 2 : 1; } else col[i] = v; } };
const fillAny = (points, k, col, a, e) => { for (let i = a; i < e; i++) col.push(points[i][k]); };
export async function packPointsSliced(points, { pause = () => new Promise((r) => setTimeout(r, 0)), budgetMs = 12, sliceRows = 8000, signal = null } = {}) {
  if (packed.has(points)) return packed.get(points);
  const n = points.length;
  let last = performance.now();
  const cancelled = () => Object.assign(new Error("Cancelled."), { cancelled: true });
  const tick = async () => {
    if (signal?.aborted) throw cancelled();
    if (performance.now() - last >= budgetMs) { await pause(); last = performance.now(); if (signal?.aborted) throw cancelled(); }
  };
  const keys = new Set();
  for (let a = 0; a < n; a += sliceRows) { addKeys(points, a, Math.min(n, a + sliceRows), keys); await tick(); }
  const num = {}, nulls = {}, other = {}, strs = {};
  for (const k of keys) {
    const st = { numeric: true, anyNull: false };
    for (let a = 0; a < n && st.numeric; a += sliceRows) { scanSlice(points, k, a, Math.min(n, a + sliceRows), st); await tick(); }
    if (st.numeric) {
      const col = new Float64Array(n), mask = st.anyNull ? new Uint8Array(n) : null;
      for (let a = 0; a < n; a += sliceRows) { fillNum(points, k, col, mask, a, Math.min(n, a + sliceRows)); await tick(); }
      num[k] = col; if (mask) nulls[k] = mask;
    } else {
      const sst = { str: true };
      for (let a = 0; a < n && sst.str; a += sliceRows) { isStrCol(points, k, a, Math.min(n, a + sliceRows), sst); await tick(); }
      if (sst.str) {
        const codes = new Int32Array(n), table = [], map = new Map();
        for (let a = 0; a < n; a += sliceRows) { encodeStr(points, k, a, Math.min(n, a + sliceRows), codes, map, table); await tick(); }
        strs[k] = { table, codes };
      } else {
        const col = []; // built by push: new Array(n) past 100,000 elements is a slow dictionary-mode array in V8
        for (let a = 0; a < n; a += sliceRows) { fillAny(points, k, col, a, Math.min(n, a + sliceRows)); await tick(); }
        other[k] = col;
      }
    }
  }
  const out = { n, num, nulls, other, strs };
  packed.set(points, out);
  return out;
}

// the columns -> the same point objects (a field a point did not have stays absent; null stays null)
export function unpackPoints({ n, num, nulls, other, strs = {} }) {
  const out = new Array(n);
  const numKeys = Object.keys(num), otherKeys = Object.keys(other), strKeys = Object.keys(strs);
  for (let i = 0; i < n; i++) {
    const p = {};
    for (const k of numKeys) { const m = nulls[k]?.[i]; if (m === 2) continue; p[k] = m === 1 ? null : num[k][i]; }
    for (const k of strKeys) { const c = strs[k].codes[i]; if (c !== -1) p[k] = c === -2 ? null : strs[k].table[c]; } // #3389
    for (const k of otherKeys) { const v = other[k][i]; if (v !== undefined) p[k] = v; }
    out[i] = p;
  }
  return out;
}

// TASKS.csv #555 — assays and large interval layers stored as COLUMNS in the project file and the 60 s autosave.
// They used to be one JSON object per row, every row repeating "hole_id", "from", "to", "values":{"Au":…} and
// "source":"assay": 63k Harry-sized rows were 13 MB and 92-243 ms of JSON.stringify on the UI thread per save.
//
// EXACT, unlike compactRows.js's Float32 point clouds: assays must round-trip to the same numbers. So:
//   - a field whose present values are all finite numbers -> ONE comma-joined string of them (empty = absent).
//     String(number) is JavaScript's shortest exact form and Number() reads it back bit for bit. A string, not a
//     number array, because JSON.stringify of a long string is little more than a copy, while 63k-element
//     number arrays cost as much to stringify as the original rows did;
//   - any other field -> a dictionary of distinct values + one comma-joined string of integer codes per row
//     (-1 = absent), which is what shrinks the repeated hole ids, sources, units and lithology codes;
//   - the per-row `values` object (assay elements) -> one such column per element.
// Absent and explicit null stay different, and a NaN is written as null exactly as JSON.stringify did before.
// Cached per array (WeakMap), so an autosave after an unrelated edit re-encodes nothing.
export const COMPACT_TABLE_MIN_ROWS = 2000; // below this the plain JSON is small and easier to read

const cache = new WeakMap();
const NESTED = "values"; // the one nested object worth splitting into columns

function encodeColumn(get, n) {
  let numeric = true, any = false;
  for (let i = 0; i < n; i++) {
    const v = get(i);
    if (v === undefined) continue;
    any = true;
    if (typeof v !== "number" || !Number.isFinite(v)) { numeric = false; break; }
  }
  if (!any) return null;
  if (numeric) {
    const a = new Array(n);
    for (let i = 0; i < n; i++) { const v = get(i); a[i] = v === undefined ? "" : String(v); }
    return { n: a.join(",") };
  }
  const dict = [], index = new Map(), codes = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = get(i);
    if (v === undefined) { codes[i] = -1; continue; }
    const key = typeof v === "string" ? "s" + v : "j" + JSON.stringify(v); // NaN/Infinity -> "jnull", as JSON writes them
    let c = index.get(key);
    if (c === undefined) { c = dict.length; index.set(key, c); dict.push(typeof v === "number" && !Number.isFinite(v) ? null : v); }
    codes[i] = c;
  }
  return { d: dict, c: codes.join(",") };
}

// columns are decoded once per load into arrays (split), then read per row
function openColumn(col) {
  if (typeof col.n === "string") return { num: col.n.split(",") };
  return { dict: col.d, codes: typeof col.c === "string" ? col.c.split(",") : col.c };
}

function decodeColumn(col, i) {
  if (col.num) { const v = col.num[i]; return v === "" || v === undefined ? undefined : Number(v); }
  const c = Number(col.codes[i]);
  return c < 0 ? undefined : col.dict[c];
}

export function compactTable(rows) {
  if (!Array.isArray(rows) || rows.length < COMPACT_TABLE_MIN_ROWS) return rows;
  const hit = cache.get(rows);
  if (hit) return hit;
  const n = rows.length;
  // rows that aren't plain objects (never expected) keep the whole array as it was
  if (!rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) return rows;
  const keys = new Set(), nestedKeys = new Set();
  let nestedOk = true;
  for (const r of rows) {
    for (const k in r) keys.add(k);
    const v = r[NESTED];
    if (v === undefined) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) { nestedOk = false; continue; }
    for (const k in v) nestedKeys.add(k);
  }
  const cols = {};
  for (const k of keys) {
    if (k === NESTED && nestedOk) continue;
    const col = encodeColumn((i) => rows[i][k], n);
    if (col) cols[k] = col;
  }
  let nested = null;
  if (nestedOk && keys.has(NESTED)) {
    nested = { has: encodeColumn((i) => (rows[i][NESTED] === undefined ? undefined : 1), n), cols: {} };
    for (const k of nestedKeys) {
      const col = encodeColumn((i) => rows[i][NESTED]?.[k], n);
      if (col) nested.cols[k] = col;
    }
  }
  const out = { __compactTable: 1, n, cols, ...(nested ? { nested } : {}) };
  cache.set(rows, out);
  return out;
}

export function expandTable(stored) {
  if (!stored || !stored.__compactTable) return stored;
  const { n, cols, nested } = stored;
  const colEntries = Object.entries(cols).map(([k, c]) => [k, openColumn(c)]);
  const nestedEntries = nested ? Object.entries(nested.cols).map(([k, c]) => [k, openColumn(c)]) : [];
  const has = nested ? openColumn(nested.has) : null;
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = {};
    for (const [k, col] of colEntries) { const v = decodeColumn(col, i); if (v !== undefined) r[k] = v; }
    if (has && decodeColumn(has, i) !== undefined) {
      const o = {};
      for (const [k, col] of nestedEntries) { const v = decodeColumn(col, i); if (v !== undefined) o[k] = v; }
      r[NESTED] = o;
    }
    rows[i] = r;
  }
  return rows;
}

// interval layers: every big row array in the `layers` object except geophys_pts (compactRows.js, Float32)
export const compactIntervalLayers = (layers) => {
  if (!layers || typeof layers !== "object") return layers;
  let out = layers;
  for (const [k, v] of Object.entries(layers)) {
    if (k === "geophys_pts" || !Array.isArray(v) || v.length < COMPACT_TABLE_MIN_ROWS) continue;
    const c = compactTable(v);
    if (c !== v) { if (out === layers) out = { ...layers }; out[k] = c; }
  }
  return out;
};
export const expandIntervalLayers = (layers) => {
  if (!layers || typeof layers !== "object") return layers;
  let out = layers;
  for (const [k, v] of Object.entries(layers)) if (v && v.__compactTable) { if (out === layers) out = { ...layers }; out[k] = expandTable(v); }
  return out;
};

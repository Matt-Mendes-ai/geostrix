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
// Cached per array (WeakMap), so an autosave after an unrelated edit re-encodes nothing. TASKS.csv #721 — that cache is
// why ROWS ARE IMMUTABLE: replace a row (and the array) through the store setters, never edit one in place, or the
// next save writes the encoding of the old values.
export const COMPACT_TABLE_MIN_ROWS = 2000; // below this the plain JSON is small and easier to read

const cache = new WeakMap();
const NESTED = "values"; // the one nested object worth splitting into columns

// TASKS.csv #3104 — one column, pausing every CHUNK rows (a column of 148,000 distinct sample ids alone was 0.3-1.5 s on a loaded machine)
const CHUNK = 16384;
function* encodeColumnSteps(get, n) {
  let numeric = true, any = false;
  for (let i = 0; i < n; i++) {
    if (i % CHUNK === CHUNK - 1) yield;
    const v = get(i);
    if (v === undefined) continue;
    any = true;
    if (typeof v !== "number" || !Number.isFinite(v)) { numeric = false; break; }
  }
  if (!any) return null;
  if (numeric) {
    const a = new Array(n);
    for (let i = 0; i < n; i++) { if (i % CHUNK === CHUNK - 1) yield; const v = get(i); a[i] = v === undefined ? "" : String(v); }
    return { n: a.join(",") };
  }
  // TASKS.csv #2334 — strings keyed by themselves, everything else by its JSON (NaN/Infinity -> "null", as JSON writes them):
  // the same codes as one map of "s"+v / "j"+JSON keys, without building a key string per row
  const dict = [], strIndex = new Map(), index = new Map(), codes = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i % CHUNK === CHUNK - 1) yield;
    const v = get(i);
    if (v === undefined) { codes[i] = -1; continue; }
    let c;
    if (typeof v === "string") {
      c = strIndex.get(v);
      if (c === undefined) { c = dict.length; strIndex.set(v, c); dict.push(v); }
    } else {
      const key = JSON.stringify(v);
      c = index.get(key);
      if (c === undefined) { c = dict.length; index.set(key, c); dict.push(typeof v === "number" && !Number.isFinite(v) ? null : v); }
    }
    codes[i] = c;
  }
  return { d: dict, c: codes.join(",") };
}

// TASKS.csv #3104 — the encoding as steps, one column per step: compactTable runs them at once; compactTableSliced (the autosave) pauses
// between them, so 146,970 assays are no longer one 1.2 s main-thread task. The same code either way: the same text.
export function compactTable(rows) {
  const it = compactSteps(rows);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
export async function compactTableSliced(rows, pause) {
  const it = compactSteps(rows);
  let r = it.next();
  while (!r.done) { await pause(); r = it.next(); }
  return r.value;
}
function* compactSteps(rows) {
  if (!Array.isArray(rows) || rows.length < COMPACT_TABLE_MIN_ROWS) return rows;
  const hit = cache.get(rows);
  if (hit) return hit;
  const n = rows.length;
  // rows that aren't plain objects (never expected) keep the whole array as it was
  for (let i = 0; i < n; i++) { const r = rows[i]; if (!(r && typeof r === "object" && !Array.isArray(r))) return rows; if (i % CHUNK === CHUNK - 1) yield; }
  const keys = new Set(), nestedKeys = new Set();
  let nestedOk = true, seen = 0;
  for (const r of rows) {
    if (++seen % CHUNK === 0) yield; // #3104
    for (const k in r) keys.add(k);
    const v = r[NESTED];
    if (v === undefined) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) { nestedOk = false; continue; }
    for (const k in v) nestedKeys.add(k);
  }
  const cols = {};
  for (const k of keys) {
    if (k === NESTED && nestedOk) continue;
    yield; // #3104
    const col = yield* encodeColumnSteps((i) => rows[i][k], n);
    if (col) cols[k] = col;
  }
  let nested = null;
  if (nestedOk && keys.has(NESTED)) {
    nested = { has: yield* encodeColumnSteps((i) => (rows[i][NESTED] === undefined ? undefined : 1), n), cols: {} };
    for (const k of nestedKeys) {
      yield; // #3104
      const col = yield* encodeColumnSteps((i) => rows[i][NESTED]?.[k], n);
      if (col) nested.cols[k] = col;
    }
  }
  const out = { __compactTable: 1, n, cols, ...(nested ? { nested } : {}) };
  cache.set(rows, out);
  return out;
}

// TASKS.csv #1500 (review #1497, Lawyers) — each column decoded ONCE into a typed array before the rows are built: a numeric column to a
// Float64Array with NaN for absent (its present values are all finite numbers, so NaN cannot be one of them), a coded column
// to an Int32Array of codes. It used to decode cell by cell through a generic function per row and per column: Lawyers'
// nine tables (83,670 assays x 50 elements among them) took 1.1-1.6 s of the project open. Same rows, same key order.
// TASKS.csv #1500 — a comma-joined column of numbers (String(number) forms, "" = absent) read into a Float64Array in one scan, with no
// split array and no substring per cell. EXACT: a value of at most 15 significant digits is an integer m < 2^53 over (or times) a
// power of ten <= 1e22, both exact doubles, and IEEE division / multiplication rounds that correctly, which is what Number()
// returns; anything else (more digits, a larger exponent) is read with Number() on its slice. NaN marks an absent cell.
const POW10 = Array.from({ length: 23 }, (_, k) => 10 ** k);
export function parseNumberList(str, n) {
  const out = new Float64Array(n), L = str.length;
  let i = 0;
  for (let t = 0; t < n; t++) {
    if (i >= L) { out[t] = NaN; continue; }
    const start = i;
    let neg = false, m = 0, digits = 0, frac = 0, dot = false, exp = 0, ok = true, c = str.charCodeAt(i);
    if (c === 44) { out[t] = NaN; i++; continue; } // an empty field
    if (c === 45) { neg = true; i++; }
    for (; i < L; i++) {
      c = str.charCodeAt(i);
      if (c >= 48 && c <= 57) { if (digits || c !== 48) digits++; m = m * 10 + (c - 48); if (dot) frac++; }
      else if (c === 46 && !dot) dot = true;
      else break;
    }
    if (i < L && (c === 101 || c === 69)) { // e / E
      i++; let eneg = false, e = 0;
      if (str.charCodeAt(i) === 45) { eneg = true; i++; } else if (str.charCodeAt(i) === 43) i++;
      for (; i < L; i++) { c = str.charCodeAt(i); if (c >= 48 && c <= 57) e = e * 10 + (c - 48); else break; }
      exp = eneg ? -e : e;
    }
    if (i < L && str.charCodeAt(i) !== 44) { ok = false; while (i < L && str.charCodeAt(i) !== 44) i++; }
    const p = exp - frac;
    if (ok && digits <= 15 && p >= -22 && p <= 22) { const v = p < 0 ? m / POW10[-p] : m * POW10[p]; out[t] = neg ? -v : v; }
    else out[t] = Number(str.slice(start, i)); // the slice keeps its sign
    i++; // the comma
  }
  return out;
}
function decodeAll(col, n) {
  if (typeof col.n === "string") return { num: parseNumberList(col.n, n) };
  const codes = new Int32Array(n);
  if (typeof col.c === "string") { const f = parseNumberList(col.c, n); for (let i = 0; i < n; i++) codes[i] = f[i] === f[i] ? f[i] : -1; }
  else for (let i = 0; i < n; i++) { const c = col.c[i]; codes[i] = c === undefined || c === "" ? -1 : Number(c); }
  const dict = col.d, objects = dict.some((v) => v !== null && typeof v === "object");
  return { codes, dict, objects };
}
export function expandTable(stored) {
  if (!stored || !stored.__compactTable) return stored;
  const { n, cols, nested } = stored;
  const keys = Object.keys(cols), C = keys.map((k) => decodeAll(cols[k], n));
  const nkeys = nested ? Object.keys(nested.cols) : [], NC = nkeys.map((k) => decodeAll(nested.cols[k], n));
  const has = nested ? decodeAll(nested.has, n) : null;
  const present = (col, i) => (col.num ? col.num[i] === col.num[i] : col.codes[i] >= 0);
  // TASKS.csv #721 — an object value (an assay's qualifiers { Au: "<" }) is a copy per row, never the shared dictionary entry
  const value = (col, i) => { if (col.num) return col.num[i]; const v = col.dict[col.codes[i]]; return col.objects && v !== null && typeof v === "object" ? structuredClone(v) : v; };
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = {};
    for (let c = 0; c < C.length; c++) { const col = C[c]; if (present(col, i)) r[keys[c]] = value(col, i); }
    if (has && present(has, i)) {
      const o = {};
      for (let c = 0; c < NC.length; c++) { const col = NC[c]; if (present(col, i)) o[nkeys[c]] = value(col, i); }
      r[NESTED] = o;
    }
    rows[i] = r;
  }
  // TASKS.csv #3118 (review #2876, WA iron) — the stored table IS these rows' encoding: seeded into the cache, so the first autosave after a
  // restore or an open writes it back instead of encoding 150,455 litho rows and 148,000 assays again (4.0 s on the main thread). Exact by
  // construction: the rows are decoded from it and are immutable (#721); the text written is the file's own (an older encoder's form
  // included, which every version reads).
  cache.set(rows, stored);
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

// TASKS.csv #2334 (review #2325, WA uranium) — custom layers ({ id, name, rows, unit, ... }) had no compact form: the 439,780-reading
// gamma log was 32.6 MB of '{ hole_id, depth, value, _src }' objects in the project file (customLayers was nearly all of its 35.8 MB).
// A layer of 2,000+ rows now stores its rows as exact columns like the assays (7.0 MB, the same numbers back); smaller ones stay plain.
// The encoding is cached per rows array (above), so adding or removing one layer re-encodes only that layer.
export const compactCustomLayers = (list) => {
  if (!Array.isArray(list)) return list;
  let out = list;
  list.forEach((l, i) => {
    const r = l?.rows;
    if (!Array.isArray(r) || r.length < COMPACT_TABLE_MIN_ROWS) return;
    const c = compactTable(r);
    if (c !== r) { if (out === list) out = list.slice(); out[i] = { ...l, rows: c }; }
  });
  return out;
};
export const expandCustomLayers = (list) => (Array.isArray(list) && list.some((l) => l?.rows?.__compactTable)
  ? list.map((l) => (l?.rows?.__compactTable ? { ...l, rows: expandTable(l.rows) } : l)) : list);

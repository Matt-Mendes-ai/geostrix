// TASKS.csv #2206 Phase 2 (docs/ideas/columnar-project-tables.md; shared with side 2's #3140) — a table kept as typed columns, with the rows
// derived from it on demand. The file's compact form (#555, compactTable.js) is decoded into the columns without building rows, and a table
// is written back to exactly the text compactTable(rows) writes, so the project file does not change.
//
// Table = { __table: 1, length, keys: [column names, in the rows' key order], cols: { name: Col }, nested: null | { has: Col, keys, cols } }
// Col   = { num: Float64Array }                       a column of finite numbers (NaN = the field is absent)
//       | { codes: Int32Array, dict: [], objects }    any other column: codes into dict (-1 = absent); dict holds strings, null, booleans,
//                                                     numbers of a mixed column, objects (objects: true; each row gets its own copy, #721)
// The same rules as compactTable: a column whose present values are all finite numbers is numeric; anything else is coded, strings by
// themselves and other values by their JSON, a non-finite number as null; `values` (assay elements) is split into nested columns when it is
// an object on every row that has it. rowsOf(table) builds exactly expandTable's rows (the same key order: `values` last).
import { decodeColumn, storedFor, COMPACT_TABLE_MIN_ROWS } from "./compactTable.js";

const NESTED = "values";
export const isTable = (x) => !!x && typeof x === "object" && x.__table === 1;

// --- building --------------------------------------------------------------------------------------------------------------------------
// one column from a getter over n rows -> Col, or null when no row has the field
function columnOf(get, n) {
  let numeric = true, any = false;
  for (let i = 0; i < n; i++) {
    const v = get(i);
    if (v === undefined) continue;
    any = true;
    if (typeof v !== "number" || !Number.isFinite(v)) { numeric = false; break; }
  }
  if (!any) return null;
  if (numeric) {
    const num = new Float64Array(n);
    for (let i = 0; i < n; i++) { const v = get(i); num[i] = v === undefined ? NaN : v; }
    return { num };
  }
  const dict = [], strIndex = new Map(), index = new Map(), codes = new Int32Array(n);
  let objects = false;
  for (let i = 0; i < n; i++) {
    const v = get(i);
    if (v === undefined) { codes[i] = -1; continue; }
    let c;
    if (typeof v === "string") {
      c = strIndex.get(v);
      if (c === undefined) { c = dict.length; strIndex.set(v, c); dict.push(v); }
    } else {
      const key = JSON.stringify(v);
      c = index.get(key);
      if (c === undefined) { c = dict.length; index.set(key, c); const d = typeof v === "number" && !Number.isFinite(v) ? null : v; dict.push(d); if (d !== null && typeof d === "object") objects = true; }
    }
    codes[i] = c;
  }
  return { codes, dict, objects };
}

// rows (plain objects) -> Table; anything that is not an array of plain objects is returned as it is
export function tableFromRows(rows) {
  if (!Array.isArray(rows)) return rows;
  const n = rows.length;
  for (let i = 0; i < n; i++) { const r = rows[i]; if (!(r && typeof r === "object" && !Array.isArray(r))) return rows; }
  const keySet = new Set(), nestedKeys = new Set();
  let nestedOk = true;
  for (const r of rows) {
    for (const k in r) keySet.add(k);
    const v = r[NESTED];
    if (v === undefined) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) { nestedOk = false; continue; }
    for (const k in v) nestedKeys.add(k);
  }
  const keys = [], cols = {};
  for (const k of keySet) {
    if (k === NESTED && nestedOk) continue;
    const col = columnOf((i) => rows[i][k], n);
    if (col) { keys.push(k); cols[k] = col; }
  }
  let nested = null;
  if (nestedOk && keySet.has(NESTED)) {
    nested = { has: columnOf((i) => (rows[i][NESTED] === undefined ? undefined : 1), n), keys: [], cols: {} };
    for (const k of nestedKeys) { const col = columnOf((i) => rows[i][NESTED]?.[k], n); if (col) { nested.keys.push(k); nested.cols[k] = col; } }
  }
  return { __table: 1, length: n, keys, cols, nested };
}

// the file's compact form (#555) -> Table, decoding the columns only (no rows); rows (an older or small table) -> tableFromRows
export function tableFromCompact(stored) {
  if (!stored || !stored.__compactTable) return tableFromRows(stored);
  const { n, cols, nested } = stored;
  const keys = Object.keys(cols), C = {};
  for (const k of keys) C[k] = decodeColumn(cols[k], n);
  let N = null;
  if (nested) {
    const nkeys = Object.keys(nested.cols), NC = {};
    for (const k of nkeys) NC[k] = decodeColumn(nested.cols[k], n);
    N = { has: decodeColumn(nested.has, n), keys: nkeys, cols: NC };
  }
  return { __table: 1, length: n, keys, cols: C, nested: N };
}

// --- reading ---------------------------------------------------------------------------------------------------------------------------
const present = (col, i) => (col.num ? col.num[i] === col.num[i] : col.codes[i] >= 0);
const valueAt = (col, i) => { if (col.num) return col.num[i]; const v = col.dict[col.codes[i]]; return col.objects && v !== null && typeof v === "object" ? structuredClone(v) : v; };
function rowAt(t, i) {
  const r = {};
  for (const k of t.keys) { const col = t.cols[k]; if (present(col, i)) r[k] = valueAt(col, i); }
  const N = t.nested;
  if (N && N.has && present(N.has, i)) {
    const o = {};
    for (const k of N.keys) { const col = N.cols[k]; if (present(col, i)) o[k] = valueAt(col, i); }
    r[NESTED] = o;
  }
  return r;
}

// the row objects, built once per table and kept (the same objects every call: WeakMaps and Sets keyed by row keep working); an array is
// returned as it is. The columns are read as flat arrays, not looked up by name per row (expandTable's loop). A save of a table writes its
// columns (compactFromTable), not these rows.
const rowsCache = new WeakMap();
export function rowsOf(x) {
  if (!isTable(x)) return x;
  let rows = rowsCache.get(x);
  if (rows) return rows;
  const n = x.length, keys = x.keys, C = keys.map((k) => x.cols[k]), N = x.nested, has = N?.has || null;
  const nkeys = N ? N.keys : [], NC = nkeys.map((k) => N.cols[k]);
  rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = {};
    for (let c = 0; c < C.length; c++) { const col = C[c]; if (present(col, i)) r[keys[c]] = valueAt(col, i); }
    if (has && present(has, i)) {
      const o = {};
      for (let c = 0; c < NC.length; c++) { const col = NC[c]; if (present(col, i)) o[nkeys[c]] = valueAt(col, i); }
      r[NESTED] = o;
    }
    rows[i] = r;
  }
  rowsCache.set(x, rows);
  return rows;
}
// one row, built on its own (not the cached one: for a reader that wants a few rows of a big table)
export const rowOf = (t, i) => (isTable(t) ? rowAt(t, i) : t?.[i]);
export const lengthOf = (x) => (isTable(x) ? x.length : Array.isArray(x) ? x.length : 0);
// a column for hot readers: { num: Float64Array } or { codes, dict, objects }; null when no row has it
export const colOf = (t, name) => (isTable(t) ? t.cols[name] || null : null);
// one nested (assay element) column; null when absent
export const valuesOf = (t, sym) => (isTable(t) && t.nested ? t.nested.cols[sym] || null : null);
// a column's value at row i (undefined when absent), as the row would hold it
export const cellOf = (col, i) => (col && present(col, i) ? valueAt(col, i) : undefined);

// --- writing ---------------------------------------------------------------------------------------------------------------------------
// Table -> the file's compact form, the same text compactTable(rowsOf(table)) writes (a table under COMPACT_TABLE_MIN_ROWS rows: its rows,
// as compactTable leaves a small array). Kept per table.
const compactCache = new WeakMap();
function encodeCol(col, n) {
  if (col.num) { const a = new Array(n); for (let i = 0; i < n; i++) { const v = col.num[i]; a[i] = v === v ? String(v) : ""; } return { n: a.join(",") }; }
  return { d: col.dict, c: Array.from(col.codes).join(",") };
}
export function compactFromTable(t) {
  if (!isTable(t)) return t;
  if (t.length < COMPACT_TABLE_MIN_ROWS) return rowsOf(t);
  let out = compactCache.get(t);
  if (out) return out;
  const cols = {};
  for (const k of t.keys) cols[k] = encodeCol(t.cols[k], t.length);
  let nested = null;
  if (t.nested) {
    nested = { has: t.nested.has ? encodeCol(t.nested.has, t.length) : null, cols: {} };
    for (const k of t.nested.keys) nested.cols[k] = encodeCol(t.nested.cols[k], t.length);
  }
  out = { __compactTable: 1, n: t.length, cols, ...(nested ? { nested } : {}) };
  compactCache.set(t, out);
  return out;
}

// --- the table of a rows array -----------------------------------------------------------------------------------------------------------
// TASKS.csv #2206 Phase 2 (Main's conditions: rows keep their identity across edits; an edit must not pay a full rebuild) — the store keeps
// rows; a reader that wants columns asks tableOf(rows). Kept per rows array, and its rowsOf is those very rows (the same objects). Made
//   - from the columns the rows already have (decoded from the file at open, or encoded by a save: compactTable's cache): a decode;
//   - else by patching a recent table of the same length for only the rows whose identity changed (an edit of a few rows: copy-on-write of
//     the touched columns);
//   - else from the rows (an import, a delete).
const tableCache = new WeakMap();
const recent = []; // [{ rows: WeakRef, table }], the last few tables made, for patching
const RECENT = 4, PATCH_SHARE = 0.05;
export function tableOf(rows) {
  if (isTable(rows)) return rows;
  if (!Array.isArray(rows)) return null;
  let t = tableCache.get(rows);
  if (t) return t;
  const stored = storedFor(rows);
  t = stored ? tableFromCompact(stored) : (patchFromRecent(rows) || tableFromRows(rows));
  if (!isTable(t)) return null;
  rowsCache.set(t, rows);
  tableCache.set(rows, t);
  recent.unshift({ rows: new WeakRef(rows), table: t });
  if (recent.length > RECENT) recent.length = RECENT;
  return t;
}

function patchFromRecent(rows) {
  const n = rows.length;
  for (const e of recent) {
    const old = e.rows.deref();
    if (!old || old.length !== n || n === 0) continue;
    let same = 0;
    const probes = Math.min(32, n);
    for (let p = 0; p < probes; p++) { const i = Math.floor((p * (n - 1)) / Math.max(1, probes - 1)); if (rows[i] === old[i]) same++; }
    if (same < probes * 0.75) continue;
    const changed = [];
    for (let i = 0; i < n; i++) if (rows[i] !== old[i]) { changed.push(i); if (changed.length > n * PATCH_SHARE) break; }
    if (changed.length > n * PATCH_SHARE) continue;
    const t = patchTable(e.table, rows, changed);
    if (t) return t;
  }
  return null;
}

// a copy of t with the rows at `changed` replaced by rows[i]; null when the change does not fit the columns (a new field, a number column
// given text, `values` no longer an object): the caller rebuilds
function patchTable(t, rows, changed) {
  if (!changed.length) return { ...t }; // a new array of the same rows
  const keySet = new Set(t.keys), N = t.nested, nkeySet = new Set(N ? N.keys : []);
  for (const i of changed) {
    const r = rows[i];
    if (!(r && typeof r === "object" && !Array.isArray(r))) return null;
    for (const k in r) {
      if (k === NESTED && N) continue;
      if (!keySet.has(k)) return null;
    }
    const v = r[NESTED];
    if (N) { if (v !== undefined && (!v || typeof v !== "object" || Array.isArray(v))) return null; if (v) for (const k in v) if (!nkeySet.has(k)) return null; }
    else if (v !== undefined && !keySet.has(NESTED)) return null;
  }
  const cols = {};
  for (const k of t.keys) { const c = patchCol(t.cols[k], changed, (i) => rows[i][k]); if (!c) return null; cols[k] = c; }
  let nested = null;
  if (N) {
    const has = N.has ? patchCol(N.has, changed, (i) => (rows[i][NESTED] === undefined ? undefined : 1)) : null;
    if (N.has && !has) return null;
    nested = { has, keys: N.keys, cols: {} };
    for (const k of N.keys) { const c = patchCol(N.cols[k], changed, (i) => rows[i][NESTED]?.[k]); if (!c) return null; nested.cols[k] = c; }
  }
  return { __table: 1, length: t.length, keys: t.keys, cols, nested };
}
// the column with the values at `changed` set; the same column object when none of them differs; null when a value does not fit
function patchCol(col, changed, get) {
  if (col.num) {
    let out = null;
    for (const i of changed) {
      const v = get(i);
      if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v))) return null;
      const x = v === undefined ? NaN : v, cur = col.num[i];
      if (x === cur || (x !== x && cur !== cur)) continue;
      if (!out) out = col.num.slice();
      out[i] = x;
    }
    return out ? { num: out } : col;
  }
  let codes = null, dict = col.dict, objects = col.objects, index = null;
  const keyOf = (v) => (typeof v === "string" ? "s" + v : "j" + JSON.stringify(v));
  for (const i of changed) {
    const v = get(i);
    // unchanged (the usual case for the columns an edit did not touch): no dictionary lookup
    const k0 = col.codes[i], cur = k0 >= 0 ? col.dict[k0] : undefined;
    if (v === cur && (v === undefined || v === null || typeof v !== "object") && !(typeof v === "number" && !Number.isFinite(v))) continue;
    if (v !== null && cur !== null && typeof v === "object" && typeof cur === "object" && v !== undefined && cur !== undefined && JSON.stringify(v) === JSON.stringify(cur)) continue;
    let c;
    if (v === undefined) c = -1;
    else {
      if (!index) { index = new Map(); dict.forEach((d, k) => { const key = keyOf(d); if (!index.has(key)) index.set(key, k); }); }
      const key = typeof v === "number" && !Number.isFinite(v) ? keyOf(null) : keyOf(v);
      c = index.get(key);
      if (c === undefined) {
        if (dict === col.dict) dict = col.dict.slice();
        c = dict.length; const d = typeof v === "number" && !Number.isFinite(v) ? null : v; dict.push(d); index.set(key, c);
        if (d !== null && typeof d === "object") objects = true;
      }
    }
    if (col.codes[i] === c && !(objects && c >= 0 && dict[c] !== null && typeof dict[c] === "object")) continue;
    if (!codes) codes = col.codes.slice();
    codes[i] = c;
  }
  return codes || dict !== col.dict ? { codes: codes || col.codes, dict, objects } : col;
}

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
// TASKS.csv #3424 (startup size) — this file is the light half, loaded at startup by the store and the readers: reading a Table (rowsOf, rowOf,
// colOf, valuesOf, cellOf, lengthOf) and the probe rowsBuilt. Building, decoding, encoding and tableOf are in ./rowTableBuild.js, loaded when
// a Table is first made; it registers its functions in tableOps, so a save of a Table (which exists only once that file has loaded) needs no
// import of it at startup.

const NESTED = "values";
export const isTable = (x) => !!x && typeof x === "object" && x.__table === 1;

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
// TASKS.csv #3424 — has anything asked a table for its rows yet (the probe for "no reader forces rows")
export const rowsBuilt = (t) => isTable(t) && rowsCache.has(t);
// one row, built on its own (not the cached one: for a reader that wants a few rows of a big table)
export const rowOf = (t, i) => (isTable(t) ? rowAt(t, i) : t?.[i]);
export const lengthOf = (x) => (isTable(x) ? x.length : Array.isArray(x) ? x.length : 0);
// a column for hot readers: { num: Float64Array } or { codes, dict, objects }; null when no row has it
export const colOf = (t, name) => (isTable(t) ? t.cols[name] || null : null);
// one nested (assay element) column; null when absent
export const valuesOf = (t, sym) => (isTable(t) && t.nested ? t.nested.cols[sym] || null : null);
// a column's value at row i (undefined when absent), as the row would hold it
export const cellOf = (col, i) => (col && present(col, i) ? valueAt(col, i) : undefined);

// TASKS.csv #3424 — rowTableBuild.js keeps a rows array's table's rows as that very array (tableOf): it seeds them here
export const seedRows = (t, rows) => { rowsCache.set(t, rows); };
// filled by rowTableBuild.js when it loads: { compactFromTable, compactFromTableSliced, tableFromCompact, tableOf }
export const tableOps = {};

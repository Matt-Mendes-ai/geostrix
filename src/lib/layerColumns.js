// TASKS.csv #3140 (step 1) — a custom layer's rows read the same way whether they are row objects (what the store holds today) or a rowTable
// Table (what a big downhole log will be held as once the store adapter, #3424, lets customLayers[].rows be one): a field read by index, counts
// and tests over a field that look at a coded column's dictionary once instead of at every row, and one row built only when asked. With a
// Table nothing here builds the whole rows array (rowsOf would: 2.07 M binned rows of a 2.58 M-reading log are 412 MB as objects, 111 MB as
// columns, measured). On a row array every function gives exactly what the plain loop over the rows gives.
import { isTable, colOf, lengthOf, rowOf } from "./rowTable.js";

export { isTable };

// the number of rows (0 for null)
export const rowCount = (rows) => lengthOf(rows);

// (i) -> row i's value of the field (undefined when the row lacks it)
export function fieldOf(rows, name) {
  if (isTable(rows)) {
    const c = colOf(rows, name);
    if (!c) return () => undefined;
    if (c.num) { const a = c.num; return (i) => { const v = a[i]; return v === v ? v : undefined; }; }
    const { codes, dict } = c;
    return (i) => { const k = codes[i]; return k < 0 ? undefined : dict[k]; };
  }
  return (i) => rows[i]?.[name];
}

// the fields a row can have, in the order they first appear (a Table: its columns)
export function fieldNames(rows) {
  if (isTable(rows)) return rows.keys.slice();
  const s = new Set();
  for (const r of rows || []) if (r) for (const k of Object.keys(r)) s.add(k);
  return [...s];
}

// a test per row of one field's value, decided once per distinct value of a coded column (a hole id, a code, the file name in _src)
function tester(rows, name, pred) {
  const c = colOf(rows, name);
  if (!c) { const miss = !!pred(undefined); return () => miss; }
  if (c.num) { const a = c.num; return (i) => { const v = a[i]; return !!pred(v === v ? v : undefined); }; }
  const ok = c.dict.map((d) => !!pred(d)), miss = !!pred(undefined), codes = c.codes;
  return (i) => { const k = codes[i]; return k < 0 ? miss : ok[k]; };
}

// how many rows have pred(value) true for the field
export function countWhere(rows, name, pred) {
  const n = lengthOf(rows);
  if (!n) return 0;
  let k = 0;
  if (isTable(rows)) { const t = tester(rows, name, pred); for (let i = 0; i < n; i++) if (t(i)) k++; return k; }
  for (const r of rows) if (pred(r?.[name])) k++;
  return k;
}

// does any row have pred(value) true for the field (a Table's column that no row has: pred(undefined) for every row)
export function someWhere(rows, name, pred) {
  const n = lengthOf(rows);
  if (!n) return false;
  if (isTable(rows)) {
    const c = colOf(rows, name);
    if (!c) return !!pred(undefined);
    if (!c.num && !c.dict.some((d) => pred(d)) && !pred(undefined)) return false; // no value of the column passes: no row can
    const t = tester(rows, name, pred);
    for (let i = 0; i < n; i++) if (t(i)) return true;
    return false;
  }
  for (const r of rows) if (pred(r?.[name])) return true;
  return false;
}

// the index of the first row with pred(value) true, or -1
export function firstWhere(rows, name, pred) {
  const n = lengthOf(rows);
  if (isTable(rows)) { const t = tester(rows, name, pred); for (let i = 0; i < n; i++) if (t(i)) return i; return -1; }
  for (let i = 0; i < n; i++) if (pred(rows[i]?.[name])) return i;
  return -1;
}

// row i as an object: an array's own row; a Table's built for this call (not cached, so a reader of a few rows does not keep them all)
export const rowAt = (rows, i) => (isTable(rows) ? rowOf(rows, i) : rows[i]);

// the indices of the rows with pred(row's hole id) true, in row order (a Table: decided once per hole)
export function indicesWhere(rows, name, pred) {
  const n = lengthOf(rows), out = [];
  if (isTable(rows)) { const t = tester(rows, name, pred); for (let i = 0; i < n; i++) if (t(i)) out.push(i); return out; }
  for (let i = 0; i < n; i++) if (pred(rows[i]?.[name])) out.push(i);
  return out;
}

// does any row pass pred(row) (a test over several fields): an array's some; a Table's rows built one at a time and not kept. `needs`: a field
// pred cannot pass without (a model layer's `modelled`), so a Table without that column answers false at once
export function rowSome(rows, pred, needs = null) {
  if (!isTable(rows)) return (rows || []).some(pred);
  if (needs && !colOf(rows, needs)) return false;
  const n = rows.length;
  for (let i = 0; i < n; i++) if (pred(rowOf(rows, i))) return true;
  return false;
}

// every row as an object for a one-off reader (an export): an array as it is; a Table's rows built for this call only, so they are freed with
// the caller's work instead of staying with the Table (rowsOf keeps them for the Table's life)
export const rowsForOnce = (rows) => (isTable(rows) ? Array.from({ length: rows.length }, (_, i) => rowOf(rows, i)) : rows || []);

// the rows with pred(value) true, as objects: an array's own rows (filter), a Table's built for them only
export function rowsWhere(rows, name, pred) {
  if (!isTable(rows)) return (rows || []).filter((r) => pred(r?.[name]));
  return indicesWhere(rows, name, pred).map((i) => rowOf(rows, i));
}

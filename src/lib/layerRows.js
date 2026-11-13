// TASKS.csv #3140 — a custom layer's rows through one accessor, so a big downhole log can be kept as typed columns (`layer.table`) instead
// of millions of row objects (a 2.58 M-reading log: 310 MB as objects, 41 MB as columns; side 3's design note, 2026-11-13).
// A layer without a table is exactly as before: layer.rows, a plain array of { hole_id, from?, to?, depth?, ...fields }.
// A layer with a table:
//   table: { n, holes: [hole ids], hole: Int32Array (index into holes), from?, to?, depth?: Float64Array,
//            fields: { name: Float64Array | Float32Array | { dict: [values], codes: Int32Array (-1: none) } }, src?: "file name" }
// sorted by hole, then from / depth, so each hole is one contiguous slice; immutable (a change makes a new table, as rows arrays are, #721),
// so anything keyed by the rows array is keyed by the table. A missing number is NaN in a numeric column and leaves the key out of the row.
// A hole id comes back as text (a numeric 7 reads "7"), as the readers that group by hole already treat it (String(r.hole_id)). The rows'
// per-row _src becomes the table's one src.
// Step 1 of the note: this module and its tests only; no layer has a table yet.

const POS = ["from", "to", "depth"];
const rowsCache = new WeakMap(), rangeCache = new WeakMap(), byHoleCache = new WeakMap();

export const hasTable = (layer) => !!layer && !!layer.table && layer.table.hole instanceof Int32Array;
export const layerLength = (layer) => (hasTable(layer) ? layer.table.n : (layer?.rows || []).length);
// what identifies the layer's data (caches, undo, the 3D View's mirror): the table, or the rows array
export const layerData = (layer) => (hasTable(layer) ? layer.table : layer?.rows || null);

// one row as an object (Identify, a tooltip): the same keys a row layer would have
export function rowAt(layer, i) {
  if (!hasTable(layer)) return (layer?.rows || [])[i];
  const t = layer.table, o = { hole_id: t.holes[t.hole[i]] };
  for (const k of POS) if (t[k]) { const v = t[k][i]; if (v === v) o[k] = v; }
  for (const [name, col] of Object.entries(t.fields)) {
    if (col && col.codes) { const c = col.codes[i]; if (c >= 0) o[name] = col.dict[c]; }
    else { const v = col[i]; if (v === v) o[name] = v; }
  }
  if (t.src) o._src = t.src;
  return o;
}

// the layer's rows: layer.rows, or built from the table once and kept (per table) for a consumer that needs objects
export function rowsOf(layer) {
  if (!hasTable(layer)) return layer?.rows || [];
  const t = layer.table;
  let rows = rowsCache.get(t);
  if (!rows) { rows = new Array(t.n); for (let i = 0; i < t.n; i++) rows[i] = rowAt(layer, i); rowsCache.set(t, rows); }
  return rows;
}

export function forEachRow(layer, fn) {
  const n = layerLength(layer);
  for (let i = 0; i < n; i++) fn(i);
}

// the data fields (not hole_id / from / to / depth / _src): the table's columns, or the union of the rows' own keys
const NOT_FIELDS = new Set(["hole_id", ...POS, "_src"]);
export function fieldNames(layer) {
  if (hasTable(layer)) return Object.keys(layer.table.fields);
  const s = new Set();
  for (const r of layer?.rows || []) if (r) for (const k of Object.keys(r)) if (!NOT_FIELDS.has(k)) s.add(k);
  return [...s];
}

// a field's values, one per row: the table's column (decoded when it is a dictionary), or read from the rows
export function fieldColumn(layer, name) {
  if (hasTable(layer)) {
    const col = layer.table.fields[name] || (POS.includes(name) ? layer.table[name] : null);
    if (!col) return null;
    if (!col.codes) return col;
    const out = new Array(col.codes.length);
    for (let i = 0; i < out.length; i++) { const c = col.codes[i]; out[i] = c >= 0 ? col.dict[c] : undefined; }
    return out;
  }
  return (layer?.rows || []).map((r) => r?.[name]);
}

// a table's holes as contiguous slices: Map(hole id -> [start, end))
export function holeRanges(table) {
  let m = rangeCache.get(table);
  if (m) return m;
  m = new Map();
  for (let i = 0; i < table.n; ) { const h = table.hole[i]; let j = i + 1; while (j < table.n && table.hole[j] === h) j++; m.set(table.holes[h], [i, j]); i = j; }
  rangeCache.set(table, m);
  return m;
}

// one hole's rows (objects), in depth order for a table, in their own order for rows
export function holeRows(layer, holeId) {
  const id = String(holeId);
  if (hasTable(layer)) { const r = holeRanges(layer.table).get(id); if (!r) return []; const all = rowsOf(layer); return all.slice(r[0], r[1]); }
  const rows = layer?.rows || [];
  let by = byHoleCache.get(rows);
  if (!by) { by = new Map(); for (const row of rows) { const h = String(row?.hole_id ?? ""); (by.get(h) || by.set(h, []).get(h)).push(row); } byHoleCache.set(rows, by); }
  return by.get(id) || [];
}

// rows -> a table, or null when they do not fit its shape (no hole id on a row, a field holding an object, an empty layer). The rows are
// sorted by hole (in the order holes first appear), then from / depth; numbers stay Float64 (Float32 is a later step, with its rule).
export function tableFromRows(rows, { src = null } = {}) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const holes = [], holeOf = new Map(), n = rows.length;
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    if (!r || r.hole_id == null || r.hole_id === "") return null;
    const h = String(r.hole_id);
    let k = holeOf.get(h);
    if (k === undefined) { k = holes.length; holes.push(h); holeOf.set(h, k); }
    idx[i] = k;
  }
  const pos = POS.filter((k) => rows.some((r) => r[k] != null));
  const names = new Set();
  for (const r of rows) for (const k of Object.keys(r)) if (!NOT_FIELDS.has(k)) names.add(k);
  const kinds = {};
  for (const name of names) {
    let num = true;
    for (const r of rows) { const v = r[name]; if (v == null) continue; if (typeof v === "number") continue; if (typeof v === "string" || typeof v === "boolean") { num = false; continue; } return null; }
    kinds[name] = num ? "num" : "dict";
  }
  for (const k of pos) for (const r of rows) if (r[k] != null && typeof r[k] !== "number") return null;
  const key = pos.includes("from") ? "from" : pos.includes("depth") ? "depth" : null;
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => idx[a] - idx[b] || (key ? (rows[a][key] ?? Infinity) - (rows[b][key] ?? Infinity) : 0) || a - b);
  const t = { n, holes, hole: new Int32Array(n), fields: {} };
  for (const k of pos) t[k] = new Float64Array(n);
  for (const name of names) t.fields[name] = kinds[name] === "num" ? new Float64Array(n) : { dict: [], codes: new Int32Array(n) };
  const dictOf = {};
  for (const name of names) if (kinds[name] === "dict") dictOf[name] = new Map();
  for (let j = 0; j < n; j++) {
    const r = rows[order[j]];
    t.hole[j] = idx[order[j]];
    for (const k of pos) t[k][j] = r[k] == null ? NaN : r[k];
    for (const name of names) {
      const v = r[name], col = t.fields[name];
      if (kinds[name] === "num") { col[j] = v == null ? NaN : v; continue; }
      if (v == null) { col.codes[j] = -1; continue; }
      const m = dictOf[name];
      let c = m.get(v);
      if (c === undefined) { c = col.dict.length; col.dict.push(v); m.set(v, c); }
      col.codes[j] = c;
    }
  }
  if (src) t.src = src;
  return t;
}

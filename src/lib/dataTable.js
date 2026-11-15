// TASKS.csv #3563 (Fireweed rehearsal) — a table of the project's drillhole data to sort, filter and read: the assays and each interval / point layer, every stored column (a density's
// method, low_recovery and comment included) with its unit in the heading, all rows (the dialog windows them). Pure: the store's arrays in, a table out.
//   buildTable(source, store) -> { source, label, columns: [{ key, label, numeric, unit?, element? }], rows: [[...values]], n }
//   parseColumnFilter(text, numeric) -> (value) => boolean | null   ('>= 6', '6..8', '= 3.1', 'REG', '!REG', '"exact"')
//   applyTable(table, { filters, search, sort }) -> Int32Array of row indices
import { LAYER_META } from "./layers.js";
import { rowCount, rowAt } from "./layerColumns.js";
import { t as tr } from "./i18n.js";

const INTERVAL_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone", "geotech", "recovery", "sg", "litho_gc", "alt_gc", "mnlgy", "magsusc", "structure"];
const HIDDEN = new Set(["_src", "tip", "color", "colour", "values", "attrs", "codes", "all_codes", "modelled", "modelColor", "numeric"]);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// the sources a project can show: the assays and every layer with rows -> [{ key, label, count }]
export function tableSources(store) {
  const out = [];
  if ((store.assays || []).length) out.push({ key: "assays", label: tr("Assays"), count: store.assays.length });
  for (const k of INTERVAL_KEYS) { const n = rowCount(store.layers?.[k]); if (n) out.push({ key: k, label: tr(LAYER_META[k]?.label || k), count: n }); }
  for (const l of store.customLayers || []) { const n = rowCount(l?.rows); if (n && !rowAt(l.rows, 0)?.modelled) out.push({ key: `custom:${l.id}`, label: String(l.name || "Custom layer"), count: n }); }
  return out;
}

const first = (key) => ["hole_id", "from", "to", "depth", "sample_id"].indexOf(key);
// the columns of a set of row objects: hole, depth(s) first, the value, then the rest in their order of appearance (up to `sample` rows looked at)
function columnsOf(rows, valueLabel, unit, sample = 400) {
  const seen = new Map();
  const n = Math.min(rowCount(rows), sample);
  for (let i = 0; i < n; i++) for (const [k, v] of Object.entries(rowAt(rows, i) || {})) if (!HIDDEN.has(k) && !k.startsWith("_") && (v == null || typeof v !== "object") && !seen.has(k)) seen.set(k, isNum(v));
  for (let i = 0; i < n; i++) for (const [k, v] of Object.entries(rowAt(rows, i) || {})) if (seen.has(k) && !isNum(v) && v != null && v !== "") seen.set(k, false);
  const keys = [...seen.keys()].sort((a, b) => { const fa = first(a), fb = first(b); return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || (a === "value" ? -1 : b === "value" ? 1 : 0); });
  return keys.map((k) => ({ key: k, label: k === "value" ? (unit ? `${valueLabel} (${unit})` : valueLabel) : k === "from" || k === "to" || k === "depth" ? `${k} (m)` : k, numeric: !!seen.get(k), ...(k === "value" && unit ? { unit } : {}) }));
}

export function buildTable(source, store) {
  let label = "", columns = [], rows = [];
  if (source === "assays") {
    label = tr("Assays");
    const els = (store.assayElements || []).filter((e) => e?.symbol);
    const base = [{ key: "hole_id", label: "hole_id", numeric: false }, { key: "from", label: "from (m)", numeric: true }, { key: "to", label: "to (m)", numeric: true }];
    const raw = store.assays || [];
    const hasId = raw.some((a) => a.sample_id != null && a.sample_id !== "");
    if (hasId) base.push({ key: "sample_id", label: "sample_id", numeric: false });
    const hasType = raw.some((a) => a.sample_type);
    if (hasType) base.push({ key: "sample_type", label: "sample_type", numeric: false });
    columns = [...base, ...els.map((e) => ({ key: `el:${e.symbol}`, label: e.unit ? `${e.symbol} (${e.unit})` : e.symbol, numeric: true, unit: e.unit || undefined, element: e.symbol }))];
    rows = raw.map((a) => [a.hole_id, a.from, a.to, ...(hasId ? [a.sample_id] : []), ...(hasType ? [a.sample_type] : []), ...els.map((e) => { const v = a.values?.[e.symbol]; return isNum(v) ? v : v == null ? null : v; })]);
  } else {
    const custom = String(source).startsWith("custom:");
    const layer = custom ? (store.customLayers || []).find((l) => `custom:${l.id}` === source) : null;
    const lay = custom ? layer?.rows : store.layers?.[source];
    const meta = LAYER_META[source];
    label = custom ? String(layer?.name || "Custom layer") : tr(meta?.label || source);
    columns = columnsOf(lay, custom ? label : tr(meta?.label || source), custom ? layer?.unit || "" : meta?.unit || "");
    const n = rowCount(lay);
    rows = new Array(n);
    for (let i = 0; i < n; i++) { const r = rowAt(lay, i) || {}; rows[i] = columns.map((c) => r[c.key] ?? null); }
  }
  return { source, label, columns, rows, n: rows.length };
}

// a column filter: numbers take '>= 6', '> 6', '<= 3', '< 3', '= 3.1', '6..8' and a plain number; text takes a substring, '!word' (not containing), '"exact"' (equal); null for an empty box
export function parseColumnFilter(text, numeric) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  if (numeric) {
    let m = /^(>=|<=|>|<|=|==)\s*(-?\d+(?:[.,]\d+)?)$/.exec(t);
    if (m) { const x = Number(m[2].replace(",", ".")); const op = m[1]; return (v) => isNum(v) && (op === ">=" ? v >= x : op === "<=" ? v <= x : op === ">" ? v > x : op === "<" ? v < x : v === x); }
    m = /^(-?\d+(?:[.,]\d+)?)\s*(?:\.\.|–|—|to)\s*(-?\d+(?:[.,]\d+)?)$/i.exec(t);
    if (m) { const a = Number(m[1].replace(",", ".")), b = Number(m[2].replace(",", ".")); const lo = Math.min(a, b), hi = Math.max(a, b); return (v) => isNum(v) && v >= lo && v <= hi; }
    m = /^-?\d+(?:[.,]\d+)?$/.exec(t);
    if (m) { const x = Number(t.replace(",", ".")); return (v) => isNum(v) && v === x; }
    if (/^(blank|empty|none)$/i.test(t)) return (v) => v == null || v === "";
    if (/^(!blank|filled|any)$/i.test(t)) return (v) => isNum(v);
  }
  if (/^"[^"]*"$/.test(t)) { const w = t.slice(1, -1).toLowerCase(); return (v) => String(v ?? "").toLowerCase() === w; }
  if (t.startsWith("!")) { const w = t.slice(1).trim().toLowerCase(); return w ? (v) => !String(v ?? "").toLowerCase().includes(w) : null; }
  if (/^(blank|empty)$/i.test(t)) return (v) => v == null || v === "";
  const w = t.toLowerCase();
  return (v) => String(v ?? "").toLowerCase().includes(w);
}

// filters: { [columnIndex]: text }; search: text found in any column; sort: { col, dir: 1 | -1 } | null -> Int32Array of the row indices to show, in order
export function applyTable(table, { filters = {}, search = "", sort = null } = {}) {
  const preds = [];
  for (const [ci, text] of Object.entries(filters || {})) { const c = table.columns[Number(ci)]; const p = c ? parseColumnFilter(text, c.numeric) : null; if (p) preds.push([Number(ci), p]); }
  const q = String(search || "").trim().toLowerCase();
  const out = [];
  const rows = table.rows;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let ok = true;
    for (const [ci, p] of preds) if (!p(r[ci])) { ok = false; break; }
    if (ok && q) { ok = false; for (let k = 0; k < r.length; k++) { const v = r[k]; if (v != null && String(v).toLowerCase().includes(q)) { ok = true; break; } } }
    if (ok) out.push(i);
  }
  if (sort && table.columns[sort.col]) {
    const ci = sort.col, dir = sort.dir === -1 ? -1 : 1, numeric = table.columns[ci].numeric;
    // blanks last in either direction
    out.sort((a, b) => {
      const x = rows[a][ci], y = rows[b][ci], bx = x == null || x === "", by = y == null || y === "";
      if (bx || by) return bx && by ? a - b : bx ? 1 : -1;
      const c = numeric && isNum(x) && isNum(y) ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return c ? c * dir : a - b;
    });
  }
  return Int32Array.from(out);
}

// the depths named in a Data QC message ('... at 348.3–349.3m ...', 'interval 29-30.5 m', 'between 80 m and 90 m') -> { from, to } | null
export function depthsInMessage(text) {
  const s = String(text || "");
  let m = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*m\b/.exec(s);
  if (m) return { from: Number(m[1]), to: Number(m[2]) };
  m = /between\s+(\d+(?:\.\d+)?)\s*m\s+and\s+(\d+(?:\.\d+)?)\s*m/i.exec(s);
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null;
}

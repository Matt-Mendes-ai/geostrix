// TASKS.csv #3424 (startup size) — the readers of a Table that run only once one exists: the drillhole scene's row indices by hole, the
// present elements (#1679) and the unit-source test (#2529) read from columns. Loaded with ./rowTableBuild.js (which every Table comes
// from) and registered in rowTable.js's tableOps, so the startup code calls them without importing this file.
import { valuesOf, colOf, cellOf } from "./rowTable.js";

// TASKS.csv #3424 step 2 — a Table's row indices grouped by hole_id (the drillhole scene's groupByHole without rows), in row order; a row with
// no hole_id is left out, as groupByHole does. keep: an optional Set of hole ids (a patch of moved holes). Cached per table when keep is null.
const byHoleCache = new WeakMap();
export function indicesByHole(t, keep = null) {
  if (!keep) { const c = byHoleCache.get(t); if (c) return c; }
  const m = new Map(), col = t?.cols?.hole_id;
  if (col?.codes) {
    const lists = col.dict.map((d) => (d && (!keep || keep.has(d)) ? [] : null));
    for (let i = 0; i < col.codes.length; i++) { const c = col.codes[i]; if (c >= 0 && lists[c]) lists[c].push(i); }
    col.dict.forEach((d, c) => { if (lists[c]?.length) m.set(d, lists[c]); });
  } else if (col?.num) { // numeric hole ids (a numbered hole list)
    for (let i = 0; i < col.num.length; i++) { const v = col.num[i]; if (!(v === v) || v === 0 || (keep && !keep.has(v))) continue; let a = m.get(v); if (!a) { a = []; m.set(v, a); } a.push(i); }
  }
  if (!keep && t) byHoleCache.set(t, m);
  return m;
}

// #1679 on a Table: an element is present when its column has a finite number in some row
function columnHasNumber(col) {
  if (!col) return false;
  if (col.num) { for (let i = 0; i < col.num.length; i++) if (col.num[i] === col.num[i]) return true; return false; }
  const ok = col.dict.map((d) => typeof d === "number" && Number.isFinite(d));
  if (!ok.some(Boolean)) return false;
  for (let i = 0; i < col.codes.length; i++) { const c = col.codes[i]; if (c >= 0 && ok[c]) return true; }
  return false;
}
export function presentElements(elements, t) {
  if (!elements?.length) return elements;
  const keep = elements.filter((e) => columnHasNumber(valuesOf(t, e.symbol)));
  return keep.length === elements.length ? elements : keep;
}

// TASKS.csv #3424 step 2 — the same test on a custom layer held as a Table (lib/rowTable.js), read from its columns without building rows:
// a layer with no from / to column (a downhole log of depths) is not a unit layer, at once; numeric from / to columns and a coded value
// column are counted as codes() counts the rows. -> the same { distinct, rows } or null
export function unitCodes(t) {
  const F = colOf(t, "from"), T = colOf(t, "to"), V = colOf(t, "value");
  if (!F || !T || !V) return null;
  const num = (col, i) => (col.num ? col.num[i] : Number(cellOf(col, i)));
  const dictText = V.codes ? V.dict.map((d) => (d == null ? "" : String(d).trim())) : null;
  let n = 0, text = 0;
  const set = new Set();
  for (let i = 0; i < t.length; i++) {
    const a = num(F, i), b = num(T, i);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) continue;
    const s = dictText ? (V.codes[i] >= 0 ? dictText[V.codes[i]] : "") : V.num[i] === V.num[i] ? String(V.num[i]) : "";
    if (!s) continue;
    n++;
    if (!Number.isFinite(Number(s))) text++;
    if (set.size <= 300) set.add(s);
  }
  return n && text >= n / 2 && set.size <= 300 ? { distinct: set.size, rows: n } : null;
}

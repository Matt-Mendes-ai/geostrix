// TASKS.csv #3424 ((A) step 1: the store adapter; docs/ideas/columnar-project-tables.md) — assays, survey and a custom layer's rows may be held
// in the store as a Table (lib/rowTable.js). This file is the custom layers' half of the adapter, and the present-elements reader:
//   - publishedLayers(list): the list readers see. A layer whose rows is a Table is shown as a view: the same own properties, `rows` a lazy
//     getter (rowsOf: built on the first read, then the same array), the table reachable without forcing rows (layerTableOf). Cached per list
//     and per layer, so the identities readers memoize on are stable across renders.
//   - internalLayers(list): what a setter stores. A view, or a copy of one made with its property descriptors (the getter carried, not run),
//     goes back to { ..., rows: Table }. A spread copy has run the getter: it keeps its plain rows. That is correct, only without the saving.
//   - layerTableOf(l): a layer's Table without forcing rows.
//   - elementsWithValuesOf(elements, assays): #1679's elements with a value, read from the element columns of a Table.
import { isTable, rowsOf, tableOf, valuesOf, lengthOf } from "./rowTable.js";
import { elementsWithValues } from "./presentElements.js";

const viewOfLayer = new WeakMap(); // internal layer -> its view
const layerOfView = new WeakMap(); // view -> internal layer
const tableOfGetter = new WeakMap(); // a view's rows getter -> the Table (survives a descriptor copy of the view)
const publishedOfList = new WeakMap(); // internal list -> the published list

function viewOf(l) {
  let v = viewOfLayer.get(l);
  if (v) return v;
  const t = l.rows;
  v = {};
  for (const k of Object.keys(l)) {
    if (k === "rows") {
      const get = () => rowsOf(t);
      tableOfGetter.set(get, t);
      Object.defineProperty(v, "rows", { get, enumerable: true, configurable: true });
    } else v[k] = l[k];
  }
  viewOfLayer.set(l, v);
  layerOfView.set(v, l);
  return v;
}

// Read by the store's getter on every destructure, every render (Main's condition): one WeakMap lookup per call after the first, and the same
// array (and the same views) every call while the list is unchanged; a list with no Table is returned as it is.
export function publishedLayers(list) {
  if (!Array.isArray(list)) return list;
  let out = publishedOfList.get(list);
  if (out) return out;
  out = list.some((l) => isTable(l?.rows)) ? list.map((l) => (isTable(l?.rows) ? viewOf(l) : l)) : list;
  publishedOfList.set(list, out);
  return out;
}

// a view's own rows getter, when the object carries one (a view, or a descriptor copy of a view): its Table, else null
function getterTable(l) {
  const d = l && typeof l === "object" ? Object.getOwnPropertyDescriptor(l, "rows") : null;
  return d?.get ? tableOfGetter.get(d.get) || null : null;
}

export function internalLayers(list) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const out = list.map((l) => {
    const inner = layerOfView.get(l);
    if (inner) { changed = true; return inner; }
    const t = getterTable(l);
    if (!t) return l;
    changed = true;
    const o = {};
    for (const k of Object.keys(l)) o[k] = k === "rows" ? t : l[k];
    return o;
  });
  return changed ? out : list;
}

// TASKS.csv #3424 step 2 — for code that copies or compares layers without reading their rows:
// - layerWith(l, patch): a copy of l with patch's properties, made from l's property descriptors, so a lazy rows getter is carried, not run
//   (the 3D View's `{ ...l, group }` built every row of a big log at the open);
// - rowsRefOf(l): what l's rows ARE without building them: the Table behind a lazy getter, else l.rows (for identity compares and lengths);
// - layerRowCount(l): the number of rows, without building them.
export function layerWith(l, patch = {}) {
  const o = Object.defineProperties({}, Object.getOwnPropertyDescriptors(l));
  for (const k of Object.keys(patch)) Object.defineProperty(o, k, { value: patch[k], enumerable: true, writable: true, configurable: true });
  return o;
}
export const rowsRefOf = (l) => (l ? getterTable(l) || l.rows : undefined);
export const layerRowCount = (l) => lengthOf(rowsRefOf(l));

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

export function layerTableOf(l) {
  if (!l) return null;
  return getterTable(l) || tableOf(l.rows); // tableOf: the Table itself, or the cached table of a rows array
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
export function elementsWithValuesOf(elements, assays) {
  if (!isTable(assays)) return elementsWithValues(elements, assays);
  if (!elements?.length) return elements;
  const keep = elements.filter((e) => columnHasNumber(valuesOf(assays, e.symbol)));
  return keep.length === elements.length ? elements : keep;
}

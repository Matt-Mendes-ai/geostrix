// TASKS.csv #3424 ((A) step 1: the store adapter; docs/ideas/columnar-project-tables.md) — assays, survey and a custom layer's rows may be held
// in the store as a Table (lib/rowTable.js). This file is the custom layers' half of the adapter, and the present-elements reader:
//   - publishedLayers(list): the list readers see. A layer whose rows is a Table is shown as a view: the same own properties, `rows` a lazy
//     getter (rowsOf: built on the first read, then the same array), the table reachable without forcing rows (layerTableOf). Cached per list
//     and per layer, so the identities readers memoize on are stable across renders.
//   - internalLayers(list): what a setter stores. A view, or a copy of one made with its property descriptors (the getter carried, not run),
//     goes back to { ..., rows: Table }. A spread copy has run the getter: it keeps its plain rows. That is correct, only without the saving.
//   - layerTableOf(l): a layer's Table without forcing rows.
//   - elementsWithValuesOf(elements, assays): #1679's elements with a value, read from the element columns of a Table.
import { isTable, rowsOf, tableOf, valuesOf } from "./rowTable.js";
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

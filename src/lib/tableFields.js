// TASKS.csv #3424 ((A) step 1: the store adapter; docs/ideas/columnar-project-tables.md) — assays, survey and a custom layer's rows may be held
// in the store as a Table (lib/rowTable.js). This file is the custom layers' half of the adapter, and the present-elements reader:
//   - publishedLayers(list): the list readers see. A layer whose rows is a Table is shown as a view: the same own properties, `rows` a lazy
//     getter (rowsOf: built on the first read, then the same array), the table reachable without forcing rows (rowsRefOf; layerTableOf in ./rowTableBuild.js). Cached per list
//     and per layer, so the identities readers memoize on are stable across renders.
//   - internalLayers(list): what a setter stores. A view, or a copy of one made with its property descriptors (the getter carried, not run),
//     goes back to { ..., rows: Table }. A spread copy has run the getter: it keeps its plain rows. That is correct, only without the saving.
//   - layerTableOf(l): a layer's Table without forcing rows — moved to ./rowTableBuild.js (it may build a table from rows; startup size, #3424).
//   - elementsWithValuesOf(elements, assays): #1679's elements with a value, read from the element columns of a Table.
import { isTable, rowsOf, lengthOf, tableOps } from "./rowTable.js";
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



// #1679 on a Table: its element columns, read by ./tableReaders.js (loaded with the Table: startup size, #3424)
export function elementsWithValuesOf(elements, assays) {
  return isTable(assays) ? tableOps.presentElements(elements, assays) : elementsWithValues(elements, assays);
}

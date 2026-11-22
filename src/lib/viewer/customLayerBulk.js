// TASKS.csv #4007 (Matt, 2026-11-22) — the Custom layers list in bulk: one import makes many layers (a per-mineral database import, #3205 / #3307, makes one
// numeric layer per mineral, each with its own bin), so the list gets "Delete all", rows picked with Ctrl / Shift + click, "Delete this import's layers", and
// names that keep their distinguishing end. Pure logic: ViewerModule and the hook in modules/viewer/useCustomLayerPicks.js call it.
import { rowsRefOf } from "../tableFields.js";
import { rowAt, rowCount } from "../layerColumns.js";

// the import a layer came from: the file or database view its rows were stamped with (_src, set by the log-channel and per-mineral imports, #2885), or ""
// (a plain custom layer carries none: it is the only layer of its import, so it has no siblings)
export function layerImportKey(layer) {
  const rows = rowsRefOf(layer);
  if (!rows || !rowCount(rows)) return "";
  const s = rowAt(rows, 0)?._src;
  return typeof s === "string" ? s.trim() : "";
}

// the layers made by the same import as `layer`, the layer included, in list order; [] when it came from no known import or is the only one
export function importSiblings(layers, layer) {
  const key = layerImportKey(layer);
  if (!key) return [];
  const same = (layers || []).filter((l) => layerImportKey(l) === key);
  return same.length > 1 ? same : [];
}

// a click with Ctrl / Meta toggles one row; a click with Shift picks the run from the last picked row to this one (`anchor`); a plain click is not a pick (it
// shows or hides the layer). -> { picked: Set, anchor } or null when the click is not a pick
export function pickClick({ picked, anchor, order }, id, { ctrl = false, shift = false } = {}) {
  const next = new Set(picked || []);
  if (shift && anchor != null && order.includes(anchor) && order.includes(id)) {
    const a = order.indexOf(anchor), b = order.indexOf(id);
    for (const k of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(k);
    return { picked: next, anchor };
  }
  if (ctrl || shift) { if (next.has(id)) next.delete(id); else next.add(id); return { picked: next, anchor: id }; }
  return null;
}

// the picked ids that are still in the list, in list order (a layer removed some other way drops out of the pick)
export const pickedIn = (picked, order) => order.filter((id) => picked.has(id));

const SEPARATORS = /[\s:._\-/]/;
const MAX = 20; // characters that fit the sidebar row beside the eye, the count and the three icons at the usual width; CSS still ends a longer one with an ellipsis

// a name cut in the middle, so the start (the database, the file) and the end (the field, the mineral) both show
export function middleCut(name, max = MAX) {
  const s = String(name ?? "");
  if (s.length <= max) return s;
  const tail = Math.ceil((max - 1) * 0.6), head = max - 1 - tail;
  return s.slice(0, head).trimEnd() + "…" + s.slice(s.length - tail).trimStart();
}

const commonPrefix = (names) => {
  let p = names[0] || "";
  for (const n of names) { let i = 0; while (i < p.length && i < n.length && p[i] === n[i]) i++; p = p.slice(0, i); }
  return p;
};

// what each layer's row shows (id -> text). A name that fits is shown as it is. A long one among the layers of one import loses what they all share at the
// start (the database and view, up to a separator) and starts with "...", and if it is still long what they all share at the end too (an "_visual_pct"), so the
// field or mineral that tells them apart is what is read; a long one with no siblings is cut in the middle. The full name is the row's tooltip.
const commonSuffix = (names) => [...commonPrefix(names.map((n) => [...n].reverse().join("")))].reverse().join("");
export function displayNames(layers, max = MAX) {
  const out = new Map();
  const groups = new Map();
  for (const l of layers || []) { const k = layerImportKey(l); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); } }
  for (const l of layers || []) {
    const name = String(l.name ?? "");
    if (name.length <= max) { out.set(l.id, name); continue; }
    const sibs = groups.get(layerImportKey(l)) || [];
    let shown = null;
    if (sibs.length > 1) {
      const names = sibs.map((s) => String(s.name ?? ""));
      let cut = commonPrefix(names).length;
      while (cut > 0 && !SEPARATORS.test(name[cut - 1])) cut--; // back to a whole word
      if (cut < 6 || cut >= name.length) cut = 0;
      let end = name.length - commonSuffix(names).length;
      while (end < name.length && !SEPARATORS.test(name[end])) end++; // forward to where a shared ending starts
      const lead = cut ? "…" : "", core = name.slice(cut).replace(/^[\s:._\-/]+/, "");
      shown = lead + core;
      if (shown.length > max && name.length - end >= 4 && end > cut) shown = lead + name.slice(cut, end).replace(/^[\s:._\-/]+/, "") + "…";
      if (!cut && shown === name) shown = null;
    }
    out.set(l.id, shown == null || shown.length > max ? middleCut(shown == null ? name : shown, max) : shown);
  }
  return out;
}

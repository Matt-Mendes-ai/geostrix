// TASKS.csv #3681 (Fireweed rehearsal round 3) — a single hole renamed or deleted from its own row in the Holes list (a core shack's typo, an abandoned hole):
// the hole id changed, or the hole removed, in EVERY table that keys rows by it — collars, survey, the interval and point layers, assays, the custom layers,
// and the intercept ids that carry it — as one step (the store applies these in one handler, so one Undo restores all). Pure: rows in, rows out; a table
// with no row for the hole comes back as the same object (no copy, no change).
import { rowsOf } from "./rowTable.js";

const rowsArray = (x) => (Array.isArray(x) ? x : rowsOf(x));

// the rows with hole_id `from` re-keyed to `to`; the same input when none is
export function renameInRows(rows, from, to) {
  const list = rowsArray(rows);
  if (!Array.isArray(list) || !list.some((r) => r && r.hole_id === from)) return rows;
  return list.map((r) => (r && r.hole_id === from ? { ...r, hole_id: to } : r));
}
// the rows without the hole's; the same input when it has none
export function deleteInRows(rows, id) {
  const list = rowsArray(rows);
  if (!Array.isArray(list) || !list.some((r) => r && r.hole_id === id)) return rows;
  return list.filter((r) => !(r && r.hole_id === id));
}
// an object of tables (the layers): each value that is a table of rows is edited, the rest (point surveys, flags) kept
export function mapLayers(layers, fn) {
  let changed = false;
  const out = {};
  for (const [k, v] of Object.entries(layers || {})) {
    const nv = k === "geophys_pts" || !v || typeof v !== "object" ? v : fn(v);
    if (nv !== v) changed = true;
    out[k] = nv;
  }
  return changed ? out : layers;
}
// the custom layers ({ id, name, rows }): each one's rows edited
export function mapCustomLayers(list, fn) {
  let changed = false;
  const out = (list || []).map((l) => { const rows = fn(l.rows); if (rows === l.rows) return l; changed = true; return { ...l, rows }; });
  return changed ? out : list;
}
// an intercept id is `${layerKey}:${hole_id}:${from}:${value}` (viewer/modelHelpers.js interceptId): the second part is the hole
const idHole = (id) => (typeof id === "string" ? id.split(":")[1] : undefined);
export function renameInInterceptIds(ids, from, to) {
  if (!Array.isArray(ids) || !ids.some((id) => idHole(id) === from)) return ids;
  return ids.map((id) => { if (idHole(id) !== from) return id; const p = id.split(":"); p[1] = to; return p.join(":"); });
}
export function deleteInInterceptIds(ids, id) {
  if (!Array.isArray(ids) || !ids.some((x) => idHole(x) === id)) return ids;
  return ids.filter((x) => idHole(x) !== id);
}
export function renameInInterceptSets(sets, from, to) {
  let changed = false;
  const out = (sets || []).map((s) => { const ids = renameInInterceptIds(s.ids, from, to); if (ids === s.ids) return s; changed = true; return { ...s, ids }; });
  return changed ? out : sets;
}
export function deleteInInterceptSets(sets, id) {
  let changed = false;
  const out = (sets || []).map((s) => { const ids = deleteInInterceptIds(s.ids, id); if (ids === s.ids) return s; changed = true; return { ...s, ids }; });
  return changed ? out : sets;
}

// what a rename to `to` would clash with: "" (fine), "empty", "same" or "exists"
export function renameProblem(collars, from, to) {
  const next = String(to ?? "").trim();
  if (!next) return "empty";
  if (next === from) return "same";
  if ((collars || []).some((c) => c.hole_id === next)) return "exists";
  return "";
}
// how many rows a hole has in each table (for the delete question): { collars, survey, intervals, assays, custom }
export function holeRowCounts(f, id) {
  const n = (rows) => { const list = rowsArray(rows); return Array.isArray(list) ? list.reduce((a, r) => a + (r && r.hole_id === id ? 1 : 0), 0) : 0; };
  let intervals = 0;
  for (const [k, v] of Object.entries(f.layers || {})) if (k !== "geophys_pts" && v && typeof v === "object") intervals += n(v);
  return { collars: n(f.collars), survey: n(f.survey), intervals, assays: n(f.assays), custom: (f.customLayers || []).reduce((a, l) => a + n(l.rows), 0) };
}

// TASKS.csv #3705 (follow-up of #3681) — what names the hole in text: a section's name ('Section through TU009 (az 46°)') and the hole it was asked for, a planned hole's name
// ('TU009-target'), and the Layout pages' text, titles, captions and hole filters. The id is replaced as a whole word: not inside a longer id ('TU0091'), and not a longer one that
// continues with a dash and a digit ('JS77-023-1'). Deleting a hole leaves the text as it is (it can't know what the words meant); a section drops the hole it was asked for.
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function renameInText(text, from, to) {
  if (typeof text !== "string" || !text.includes(from)) return text;
  return text.replace(new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(from)}(?![A-Za-z0-9_]|-\\d)`, "g"), (m, pre) => pre + to);
}
const mapObjStrings = (o, keys, from, to) => {
  let out = o;
  for (const k of keys) { if (typeof o?.[k] !== "string") continue; const v = renameInText(o[k], from, to); if (v !== o[k]) out = out === o ? { ...o, [k]: v } : { ...out, [k]: v }; }
  return out;
};
export function renameInSections(sections, from, to) {
  let changed = false;
  const out = (sections || []).map((s) => {
    let n = mapObjStrings(s, ["name"], from, to);
    if (n.holeAsked === from) n = { ...n, holeAsked: to };
    if (n !== s) changed = true;
    return n;
  });
  return changed ? out : sections;
}
export function deleteInSections(sections, id) {
  if (!(sections || []).some((s) => s?.holeAsked === id)) return sections;
  return sections.map((s) => { if (s?.holeAsked !== id) return s; const { holeAsked: _h, ...rest } = s; return rest; });
}
export function renameInPlanned(planned, from, to) {
  let changed = false;
  const out = (planned || []).map((p) => { const n = mapObjStrings(p, ["name"], from, to); if (n !== p) changed = true; return n; });
  return changed ? out : planned;
}
const LAYOUT_TEXT_KEYS = ["text", "title", "caption", "holeFilter", "label", "name"];
export function renameInLayoutPages(pages, from, to) {
  let changed = false;
  const out = (pages || []).map((pg) => {
    let pe = false;
    const elements = (pg?.elements || []).map((el) => { const n = mapObjStrings(el, LAYOUT_TEXT_KEYS, from, to); if (n !== el) pe = true; return n; });
    if (!pe) return pg;
    changed = true;
    return { ...pg, elements };
  });
  return changed ? out : pages;
}

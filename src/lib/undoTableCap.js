// TASKS.csv #2894 (WA iron review) — the undo history held every big table the project had dropped. Each undo step is a reference to the
// fields of its moment (store.jsx undoSnapshot), so 'Remove all assays' and each re-import left the old 147,891-row assay table reachable
// for up to UNDO_MAX (60) steps (heap 554 -> 751 -> 948 MB over three rounds), and a removed 480,000-row log layer (with its THREE.Group)
// stayed too (1.75 GB after three). #2806 capped big map layers the same way; this does it for the two other big kinds:
// - custom layers, a list: a layer is known by its `rows` array (a rename or a style edit makes a new object that shares it). At most
//   KEEP_REMOVED big ones no longer in the project (nor in the redo steps) stay; an older one is dropped from every undo step that holds it,
//   so an Undo that far back restores the custom layers without it (the others of that step as they were).
// - the assay table, one value: at most KEEP_ASSAY_TABLES big replaced tables stay. An older step's table becomes the oldest kept one
//   (the table of the next step still held), so an Undo that far back restores everything else of that step and leaves the assays as they
//   were at that later point, never an empty table.
// Small tables are never dropped. Dropping is said once, in one notice (store.jsx). Pure.
import { t as tr } from "./i18n.js";

export const KEEP_REMOVED = 3; // big removed custom layers the history keeps (the newest)
export const KEEP_ASSAY_TABLES = 1; // big replaced assay tables the history keeps (the newest)
export const BIG_ROWS = 100000; // a table this long or longer counts; smaller ones are kept whatever their number

const len = (a) => (Array.isArray(a) ? a.length : 0);

// steps: the undo steps, oldest first ({ customLayers, assays, ... }); held: the snapshots that must stay whole (the project now, the redo
// steps). -> { steps (the same array when nothing changed), layers (names of the custom layers dropped), assayRows (rows of each assay
// table dropped) }
export function capUndoTables(steps, held, { keep = KEEP_REMOVED, keepAssays = KEEP_ASSAY_TABLES, big = BIG_ROWS } = {}) {
  const liveRows = new Set(), liveAssays = new Set();
  for (const s of held || []) {
    for (const l of s?.customLayers || []) if (l?.rows) liveRows.add(l.rows);
    if (s?.assays) liveAssays.add(s.assays);
  }
  const keptRows = new Set(), dropRows = new Set(), keptAssays = new Set(), dropAssays = new Set();
  for (let i = (steps || []).length - 1; i >= 0; i--) {
    for (const l of steps[i]?.customLayers || []) {
      const r = l?.rows;
      if (!r || liveRows.has(r) || keptRows.has(r) || dropRows.has(r) || len(r) < big) continue;
      (keptRows.size < keep ? keptRows : dropRows).add(r);
    }
    const a = steps[i]?.assays;
    if (a && !liveAssays.has(a) && !keptAssays.has(a) && !dropAssays.has(a) && len(a) >= big) (keptAssays.size < keepAssays ? keptAssays : dropAssays).add(a);
  }
  if (!dropRows.size && !dropAssays.size) return { steps, layers: [], assayRows: [] };
  const layers = [];
  for (const s of steps) for (const l of s?.customLayers || []) if (dropRows.has(l?.rows) && !layers.includes(l.name || l.id)) layers.push(l.name || l.id);
  const assayRows = [...dropAssays].map(len);
  // newest first, so a dropped table takes the table of the nearest newer step (itself kept, live or small)
  const out = steps.slice();
  let later = null;
  for (let i = out.length - 1; i >= 0; i--) {
    let s = out[i];
    if (s?.customLayers?.some((l) => dropRows.has(l?.rows))) s = { ...s, customLayers: s.customLayers.filter((l) => !dropRows.has(l?.rows)) };
    if (s && dropAssays.has(s.assays)) s = { ...s, assays: later ?? (held?.[0]?.assays ?? []) };
    out[i] = s;
    if (s && !dropAssays.has(s.assays)) later = s.assays;
  }
  return { steps: out, layers, assayRows };
}

// the notice when big tables leave the older undo steps (said once: a dropped table is gone from every step, so it is not dropped again)
export function tableCapNotice({ layers = [], assayRows = [] } = {}, keep = KEEP_REMOVED) {
  const parts = [];
  if (layers.length === 1) parts.push(tr("The custom layer \"{name}\" is too large to keep in the older undo steps: undo can bring back the last {n} removed large layers.", { name: layers[0], n: keep }));
  else if (layers.length > 1) parts.push(tr("The custom layers {names} are too large to keep in the older undo steps: undo can bring back the last {n} removed large layers.", { names: layers.map((x) => `"${x}"`).join(", "), n: keep }));
  if (assayRows.length) parts.push(tr("An earlier assay table ({rows} rows) is too large to keep in the older undo steps: undoing that far leaves the assays as they were later.", { rows: assayRows.map((n) => n.toLocaleString()).join(" + ") }));
  return parts.join(" ");
}

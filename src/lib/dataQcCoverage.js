// TASKS.csv #2493 (review #2486, WA lithium: 435 of 2,248 holes with no lithology, 44 logs stopping more than 1 m short of the hole,
// 1,998 logged intervals left out on import, and Data QC said nothing) — three Data QC infos, never errors:
//  (1) holes with no rows in a layer that most holes with a collar have (more than half), the assayed ones counted apart;
//  (2) lithology logs that end more than SHORT_M short of the hole's length (alteration is often logged only where present);
//  (3) the rows an import left out: a built-in layer's from project.importLeftOut (lib/importLeftOut.js), a custom layer's notes (#2432).
// The 1 m and "more than half" are checks this pane applies, said in the messages, not facts about the data. Pure.
import { t as tr } from "./i18n.js";
import { LAYER_META } from "./layers.js";
import { SKIP_REASONS } from "./viewer/importHelpers.js";
import { importLeftOutList } from "./importLeftOut.js";

export const SHORT_M = 1;
const SHORT_LAYERS = ["litho"]; // lithology logs run the whole hole; alteration is often logged only where present, so "short" there is noise
const list = (ids, k = 6) => ids.slice(0, k).join(", ") + (ids.length > k ? ", …" : "");
const label = (key) => LAYER_META[key]?.label || key; // the category: English, like validateIntervalLayer's ("Lithology"), so the groups match
const named = (key) => tr(label(key)); // in a message: the interface language

// -> [{ category, holeId: null, message }] (Data QC's issue shape, severity "info" added by the caller)
export function coverageInfos({ collars = [], layers = {}, assays = [], lengths = new Map(), project = null, customLayers = [] }) {
  const out = [];
  const ids = [...new Set(collars.map((c) => c.hole_id).filter(Boolean))];
  const assayed = new Set(assays.map((a) => a.hole_id));
  for (const [key, rows] of Object.entries(layers || {})) {
    if (!Array.isArray(rows) || !rows.length || key === "geophys_pts" || !ids.length) continue;
    const byHole = new Map();
    for (const r of rows) if (r?.hole_id != null) byHole.set(r.hole_id, Math.max(byHole.get(r.hole_id) ?? -Infinity, Number.isFinite(r.to) ? r.to : Number.isFinite(r.depth) ? r.depth : -Infinity));
    const have = ids.filter((id) => byHole.has(id));
    // (1) a layer most holes have: the holes without it
    if (have.length * 2 > ids.length && have.length < ids.length) {
      const missing = ids.filter((id) => !byHole.has(id)), k = missing.filter((id) => assayed.has(id)).length;
      out.push({ category: label(key), holeId: null, message: tr("{n} of {m} holes with a collar have no {layer} rows, {k} of them assayed (checked because more than half the holes have this layer): {list}.", { n: missing.length.toLocaleString(), m: ids.length.toLocaleString(), layer: named(key), k: k.toLocaleString(), list: list(missing) }) });
    }
    // (2) a continuous log ending short of the hole
    if (SHORT_LAYERS.includes(key)) {
      const short = [];
      for (const id of have) { const L = lengths.get(id)?.length, end = byHole.get(id); if (Number.isFinite(L) && Number.isFinite(end) && end < L - SHORT_M) short.push(tr("{id} ({end} of {length} m)", { id, end, length: L })); }
      if (short.length) out.push({ category: label(key), holeId: null, message: tr("{n} hole(s) have their {layer} log ending more than {d} m short of the hole's length: {list}.", { n: short.length.toLocaleString(), layer: named(key), d: SHORT_M, list: list(short, 4) }) });
    }
  }
  // (3) what the imports left out
  for (const e of importLeftOutList(project)) {
    if (!(layers?.[e.layerKey] || []).length) continue; // a layer cleared since: nothing to say about it
    const why = e.why.map(([r, c]) => `${c.toLocaleString()} ${(SKIP_REASONS[r] || (() => r))()}`).join("; ");
    out.push({ category: label(e.layerKey), holeId: null, message: e.total ? tr("{n} of {m} row(s) of {file} were left out of {layer} at import: {why}.", { n: e.n.toLocaleString(), m: e.total.toLocaleString(), file: e.file, layer: named(e.layerKey), why }) : tr("{n} row(s) of {file} were left out of {layer} at import: {why}.", { n: e.n.toLocaleString(), file: e.file, layer: named(e.layerKey), why }) });
  }
  for (const l of customLayers || []) if (l?.notes && l.rows?.length) out.push({ category: l.name, holeId: null, message: tr("{layer}: {notes}", { layer: l.name, notes: l.notes }) });
  return out;
}

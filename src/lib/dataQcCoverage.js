// TASKS.csv #2493 (review #2486, WA lithium: 435 of 2,248 holes with no lithology, 44 logs stopping more than 1 m short of the hole,
// 1,998 logged intervals left out on import, and Data QC said nothing) — three Data QC infos, never errors:
//  (1) holes with no rows in a layer that most holes with a collar have (more than half), the assayed ones counted apart;
//  (2) lithology logs that end more than SHORT_M short of the hole's length (alteration is often logged only where present);
//  (3) the rows an import left out: a built-in layer's from project.importLeftOut (lib/importLeftOut.js), a custom layer's notes (#2432).
// The 1 m and "more than half" are checks this pane applies, said in the messages, not facts about the data. Pure.
import { t as tr } from "./i18n.js";
import { LAYER_META } from "./layers.js";
import { SKIP_REASONS } from "./viewer/importHelpersCore.js";
import { importLeftOutList } from "./importLeftOut.js";

export const SHORT_M = 1;
const LOG_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone", "mnlgy", "structure", "geotech", "recovery", "litho_gc", "alt_gc", "magsusc"]; // any of these is a log (#3530); density is not: it is a measurement
const METHOD_FIELD = /^(sg_?)?method$/i, GAP_M = 0.05; // GAP_M: 5 cm: a gap smaller than a sample's rounding is not unsampled core
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
  // TASKS.csv #2897 (review #2876, WA iron) — (1) for the assays too: 341 holes with no sample (243 exploration holes and 98 bores) went unsaid
  if (ids.length && assays.length) {
    const without = ids.filter((id) => !assayed.has(id)), have = ids.length - without.length;
    if (have * 2 > ids.length && without.length) out.push({ category: "Assays", holeId: null, message: tr("{n} of {m} holes with a collar have no assays (checked because more than half the holes have assays): {list}.", { n: without.length.toLocaleString(), m: ids.length.toLocaleString(), list: list(without) }) });
  }
  // TASKS.csv #3530 (Fireweed rehearsal, Macpass: no logs at all, 48 assayed intervals with no density, 6,489 regressed densities, 960 gaps between samples; none said)
  // (4) no log of any kind: the drillholes carry assays and densities only, so nothing to model contacts from
  // (said only once something other than collars is in: a project of collars alone has not got as far as logs)
  if (ids.length && (assays.length || (layers?.sg || []).length) && !LOG_KEYS.some((k) => (layers?.[k] || []).length) && !(customLayers || []).some((l) => l?.rows?.length)) {
    const hasA = assays.length > 0, hasD = (layers?.sg || []).length > 0, v = { n: ids.length.toLocaleString() };
    out.push({ category: "Logs", holeId: null, message: hasA && hasD ? tr("No lithology, alteration, vein, structure or other log is in the project: the {n} holes carry only assays and densities, so modelling tools have no logged contacts to build from.", v)
      : hasA ? tr("No lithology, alteration, vein, structure or other log is in the project: the {n} holes carry only assays, so modelling tools have no logged contacts to build from.", v)
      : tr("No lithology, alteration, vein, structure or other log is in the project: the {n} holes carry only densities, so modelling tools have no logged contacts to build from.", v) });
  }
  // (5) assayed intervals no density interval overlaps
  if (assays.length && (layers?.sg || []).length) {
    const sgBy = new Map();
    for (const r of layers.sg) if (Number.isFinite(r.from) && Number.isFinite(r.to)) { if (!sgBy.has(r.hole_id)) sgBy.set(r.hole_id, []); sgBy.get(r.hole_id).push(r); }
    const bare = new Map();
    for (const a of assays) {
      if (!Number.isFinite(a.from) || !Number.isFinite(a.to)) continue;
      const sg = sgBy.get(a.hole_id);
      if (!sg || !sg.some((r) => r.from < a.to && r.to > a.from)) bare.set(a.hole_id, (bare.get(a.hole_id) || 0) + 1);
    }
    // holes with no density at all are the 'no Specific gravity rows' line above; this counts the intervals of holes that do have densities
    const part = [...bare].filter(([id]) => sgBy.has(id)).sort((x, y) => y[1] - x[1]), n = part.reduce((t, [, c]) => t + c, 0);
    if (n) out.push({ category: label("sg"), holeId: null, message: tr("{n} assayed interval(s) in {h} hole(s) that have densities have no {layer} interval overlapping them ({list}): a tonnage there has no measured density to use.", { n: n.toLocaleString(), h: part.length.toLocaleString(), layer: named("sg"), list: list(part.map(([id, c]) => `${id} ${c}`), 4) }) });
  }
  // (6) the values of a 'method' field kept with a layer: how many rows are of each kind (a regressed or calculated value is not a measurement)
  for (const [key, rows] of Object.entries(layers || {})) {
    if (!Array.isArray(rows) || rows.length < 2 || key === "geophys_pts") continue;
    const field = Object.keys(rows[0] || {}).find((k) => METHOD_FIELD.test(k));
    if (!field) continue;
    const by = new Map();
    for (const r of rows) { const v = String(r?.[field] ?? "").trim(); if (v) by.set(v, (by.get(v) || 0) + 1); }
    if (by.size < 2 || by.size > 8) continue;
    const total = [...by.values()].reduce((a, b) => a + b, 0);
    out.push({ category: label(key), holeId: null, message: tr("{layer} rows by '{field}': {list}.", { layer: named(key), field, list: [...by].sort((x, y) => y[1] - x[1]).map(([v, c]) => `${v} ${c.toLocaleString()} (${Math.round((c / total) * 100)}%)`).join(", ") }) });
  }
  // (7) the unsampled metres between samples inside a hole's sampled range
  if (assays.length) {
    const byHole = new Map();
    for (const a of assays) if (Number.isFinite(a.from) && Number.isFinite(a.to) && a.to > a.from) { if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []); byHole.get(a.hole_id).push(a); }
    let gaps = 0, metres = 0, holes = 0;
    for (const arr of byHole.values()) {
      arr.sort((x, y) => x.from - y.from);
      let end = arr[0].to, here = 0;
      for (let i = 1; i < arr.length; i++) { if (arr[i].from - end > GAP_M) { here++; metres += arr[i].from - end; } if (arr[i].to > end) end = arr[i].to; }
      if (here) { gaps += here; holes++; }
    }
    if (gaps) out.push({ category: "Assays", holeId: null, message: tr("{n} unsampled gap(s) of more than {d} m lie between samples inside the sampled range of {h} hole(s), {m} m in all: that core was not assayed (or its results are not in the table).", { n: gaps.toLocaleString(), d: GAP_M, h: holes.toLocaleString(), m: Math.round(metres).toLocaleString() }) });
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

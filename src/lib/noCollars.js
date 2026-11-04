// TASKS.csv #1841 / #1810 (review #1646, Kodiak) — a drillhole tool on a project with interval data and no collars. Every modelling run
// said only 'Load collars/survey data before running the ... model.' (a modelling-code body even called itself 'the alteration model'),
// and Intercepts said 'Load some lithology/alteration interval data first' with 904 lithology and 782 alteration intervals loaded. The
// real reason is that those intervals have no collar to place them in 3D: said, with the counts.
import { notice } from "./notices.js";
import { t as tr } from "./i18n.js";

// The logged intervals and assay rows, and their distinct hole ids, of a project: { intervals, holes }
export function intervalsWaiting(layers, assays = []) {
  let intervals = 0;
  const holes = new Set();
  for (const rows of Object.values(layers || {})) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) { if (r?.hole_id == null) continue; intervals++; holes.add(String(r.hole_id)); }
  }
  for (const r of assays || []) { if (r?.hole_id == null) continue; intervals++; holes.add(String(r.hole_id)); }
  return { intervals, holes: holes.size };
}

// The notice a run gives with no collars. what: a translated phrase ("the implicit model").
export function noCollarsNotice(what, layers, assays) {
  const w = intervalsWaiting(layers, assays);
  if (!w.intervals) return notice("Load collars/survey data before running {what}.", { what });
  return notice("{what} needs collars: {n} logged intervals and assays for {holes} hole(s) are loaded, but no collar places them in 3D. Import the collars (and surveys) with those hole ids.", { what: what.charAt(0).toUpperCase() + what.slice(1), n: w.intervals.toLocaleString(), holes: w.holes.toLocaleString() });
}

// The Intercepts tool's disabled reason
export function interceptsDisabledText(layers) {
  const w = intervalsWaiting(layers);
  return w.intervals
    ? tr("Needs collars: the {n} logged intervals of {holes} hole(s) have no collar to place them in 3D.", { n: w.intervals.toLocaleString(), holes: w.holes.toLocaleString() })
    : tr("Load some lithology/alteration interval data first.");
}

// TASKS.csv #1809 — the hole ids of the interval layers and assays that match no collar, in natural order (the 3D sidebar lists them
// with a strip-log button)
export function orphanHoleIds(layers, assays, collars) {
  const known = new Set((collars || []).map((c) => String(c.hole_id))), ids = new Set();
  for (const rows of Object.values(layers || {})) if (Array.isArray(rows)) for (const r of rows) if (r?.hole_id != null && !known.has(String(r.hole_id))) ids.add(String(r.hole_id));
  for (const r of assays || []) if (r?.hole_id != null && !known.has(String(r.hole_id))) ids.add(String(r.hole_id));
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

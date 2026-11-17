// TASKS.csv #3190 (Matt's decisions, 2026-11-17) — the tools GeoStrix offers an AI app over the Model Context Protocol, read-only, over the project that is open. Pure functions over a snapshot of the
// store ({ project, collars, survey, layers, assays, assayElements, sections, codeDictionary, desurveyMethod }): nothing here writes to the project, reads a file, or reaches the network. The main
// process (electron/mcpProtocol.js) checks the arguments against each tool's schema and scrubs the reply too; the same refusals are made here so this module is safe on its own.
// Lazy: loaded by dynamic import the first time an AI app asks, never in the startup bundle (TASKS.csv #3159). Every list is capped (200 rows a call, about 100 kB of reply) and paged.
import { computeBestIntercepts } from "./geochem.js";
import { excludeQAQC } from "./qaqc.js";
import { holeTraces } from "./evidenceSources.js";
import { corridorRuns, distToSegment, signedOffset } from "./sectionCorridor.js";
import { dipPrinted } from "./dipText.js";

export const MAX_ROWS = 200, DEFAULT_ROWS = 50, MAX_BYTES = 90000;
// a name that holds a secret (never an argument, never in a reply); a text that points at a file
const CREDENTIAL_KEY = /pass(word|wd|phrase)?|secret|token|api[_-]?key|credential|authorization|private[_-]?key|connection[_-]?string|\bpwd\b|safestorage/i;
const PATH_LIKE = /^[a-zA-Z]:[\\/]|^\\\\|^\/(?!\/)|(^|[\\/])\.\.([\\/]|$)|^file:|^~[\\/]|%[a-z_]+%|\$\{?[a-z_]+\}?[\\/]/i;
const PATH_IN_TEXT = /([a-zA-Z]:[\\/]|\\\\[^\s\\]+\\)[^\s"',;]+|\/(Users|home|var|etc|tmp|mnt|opt|root|private)\/[^\s"',;]+/g;

export class ToolError extends Error {}
const fail = (m) => { throw new ToolError(m); };

// what the argument checks refuse, said for the AI app and shown in the activity list
export function refusal(args) {
  const bad = [];
  const walk = (v, d) => { if (d > 4) return; if (typeof v === "string") { if (PATH_LIKE.test(v)) bad.push("path"); } else if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (CREDENTIAL_KEY.test(k)) bad.push("credential"); walk(x, d + 1); } };
  walk(args, 0);
  if (bad.includes("credential")) return "GeoStrix never accepts credentials. No password, token or key is needed to read the project.";
  if (bad.includes("path")) return "File paths are never accepted: the tools take hole ids, element symbols, layer keys and section names, and read only the open project.";
  return null;
}
// a reply without credential-like fields or absolute paths (a collar comment can hold anything the geologist typed)
export function scrubbed(value) {
  const go = (v, d) => {
    if (d > 12) return null;
    if (typeof v === "string") return v.replace(PATH_IN_TEXT, "[path removed]");
    if (Array.isArray(v)) return v.map((x) => go(x, d + 1));
    if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) if (!CREDENTIAL_KEY.test(k)) o[k] = go(x, d + 1); return o; }
    return v;
  };
  return go(value, 0);
}

const r3 = (n, d = 3) => (Number.isFinite(n) ? +n.toFixed(d) : null);
const str = (v, n = 80) => String(v ?? "").slice(0, n);
const clampInt = (v, lo, hi, dflt) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
// one page of a list: rows trimmed to the byte budget as well as to the row limit, with the way to the next page
function pageOf(all, args, make, { maxBytes = MAX_BYTES } = {}) {
  const limit = clampInt(args.limit, 1, MAX_ROWS, DEFAULT_ROWS), offset = clampInt(args.offset, 0, 1e9, 0);
  const slice = all.slice(offset, offset + limit).map(make);
  let rows = slice, bytes = JSON.stringify(rows).length;
  while (bytes > maxBytes && rows.length > 1) { rows = rows.slice(0, Math.max(1, Math.floor(rows.length * 0.7))); bytes = JSON.stringify(rows).length; }
  const end = offset + rows.length;
  const notes = [Number(args.limit) > MAX_ROWS ? `At most ${MAX_ROWS} rows are returned a call.` : "", rows.length < slice.length ? "The page was shortened to keep the reply small; ask for the next page with next_offset." : ""].filter(Boolean).join(" ");
  return { total: all.length, offset, returned: rows.length, next_offset: end < all.length ? end : null, ...(notes ? { note: notes } : {}), rows };
}
const holeOf = (snap, id) => { const h = (snap.collars || []).find((c) => String(c.hole_id) === String(id)); if (!h) fail(`No hole '${str(id, 40)}' in this project. list_holes shows the ids.`); return h; };
const unitsOf = (snap) => Object.fromEntries((snap.assayElements || []).map((e) => [e.symbol, e.unit]));
const labAssays = (snap) => excludeQAQC(snap.assays || []);
const elementOrFail = (snap, sym) => { const e = (snap.assayElements || []).find((x) => String(x.symbol).toLowerCase() === String(sym).toLowerCase()); if (!e) fail(`No element '${str(sym, 32)}' in this project's assays. Available: ${(snap.assayElements || []).slice(0, 40).map((x) => x.symbol).join(", ") || "none"}.`); return e; };
const attrsOf = (c) => { const o = {}; let n = 0; for (const [k, v] of Object.entries(c.attrs || {})) { if (n++ >= 40) break; if (v != null && typeof v !== "object") o[str(k, 40)] = typeof v === "string" ? str(v, 120) : v; } return o; };
const collarRow = (c) => ({ hole_id: c.hole_id, easting: r3(c.x, 2), northing: r3(c.y, 2), elevation: r3(c.z, 2), azimuth: r3(c.azimuth, 1), dip: Number.isFinite(c.dip) ? Number(dipPrinted(c.dip, { downPositive: true })) : null, length: r3(c.length, 2), fields: attrsOf(c) });
const layerLabel = (key) => ({ litho: "Lithology", alt: "Alteration", vein: "Veins", breccia: "Breccia", weath: "Weathering", geotech: "Geotech (RQD %)", recovery: "Recovery %", sg: "Specific gravity", mnlgy: "Mineralogy", magsusc: "Magnetic susceptibility", structure: "Structure" })[key] || key;
const layerKeys = (snap) => Object.entries(snap.layers || {}).filter(([, rows]) => Array.isArray(rows) && rows.length).map(([k]) => k);
const layerRowOut = (r) => ({ from: r3(r.from, 2), to: r3(r.to, 2), value: typeof r.value === "number" ? r3(r.value, 3) : str(r.value, 80), ...(r.comment ? { comment: str(r.comment, 160) } : {}) });
const percentile = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

const TOOLS = {
  project_summary(snap) {
    const p = snap.project || {}, lab = labAssays(snap);
    return {
      name: str(p.name || "Untitled project", 120), crs_epsg: p.epsg || null, crs_chosen: p.crsSet !== false && !!p.epsg, currency: p.currency || "$", data_credit: str(p.dataCredit, 600),
      counts: { holes: (snap.collars || []).length, survey_stations: (snap.survey || []).length, assay_intervals: lab.length, qaqc_intervals_left_out: Math.max(0, (snap.assays || []).length - lab.length), sections: (snap.sections || []).length },
      layers: layerKeys(snap).map((k) => ({ key: k, label: layerLabel(k), intervals: snap.layers[k].length })),
      elements: (snap.assayElements || []).map((e) => ({ symbol: e.symbol, unit: e.unit })),
      coordinates: "easting / northing / elevation are in the project's coordinate system; depths are metres along the hole; dip is negative for a hole pointing down.",
    };
  },
  list_holes(snap, a) {
    let rows = snap.collars || [];
    if (a.field) {
      const f = String(a.field).toLowerCase(), v = String(a.value ?? "").toLowerCase();
      if (a.value == null) fail("'value' is needed with 'field'.");
      rows = rows.filter((c) => (f === "hole_id" ? String(c.hole_id) : String((c.attrs || {})[Object.keys(c.attrs || {}).find((k) => k.toLowerCase() === f)] ?? "")).toLowerCase() === v);
    }
    return pageOf(rows, a, collarRow);
  },
  get_hole(snap, a) {
    const c = holeOf(snap, a.hole_id), id = c.hole_id;
    const survey = (snap.survey || []).filter((s) => s.hole_id === id).sort((x, y) => x.depth - y.depth);
    const logged = {};
    for (const k of layerKeys(snap)) { const rows = snap.layers[k].filter((r) => r.hole_id === id).sort((x, y) => x.from - y.from); if (rows.length) logged[k] = { intervals: rows.length, rows: rows.slice(0, 100).map(layerRowOut), ...(rows.length > 100 ? { note: "First 100 only: get_layer_rows pages through the rest." } : {}) }; }
    const own = labAssays(snap).filter((r) => r.hole_id === id), elems = new Set();
    for (const r of own) for (const [k, v] of Object.entries(r.values || {})) if (v != null) elems.add(k);
    return { collar: collarRow(c), survey: { stations: survey.length, rows: survey.slice(0, 200).map((s) => ({ depth: r3(s.depth, 2), azimuth: r3(s.azimuth, 1), dip: Number.isFinite(s.dip) ? Number(dipPrinted(s.dip, { downPositive: true })) : null })), ...(survey.length > 200 ? { note: "First 200 stations only." } : {}) }, logged_intervals: logged, assays: { intervals: own.length, elements: [...elems].sort(), note: own.length ? "get_assays gives the grades." : undefined } };
  },
  get_assays(snap, a) {
    const units = unitsOf(snap);
    const asked = Array.isArray(a.elements) && a.elements.length ? a.elements.slice(0, 8).map((s) => elementOrFail(snap, s).symbol) : (snap.assayElements || []).slice(0, 3).map((e) => e.symbol);
    if (a.hole_id != null) holeOf(snap, a.hole_id);
    const lo = Number.isFinite(a.from) ? a.from : -Infinity, hi = Number.isFinite(a.to) ? a.to : Infinity;
    const rows = labAssays(snap).filter((r) => (a.hole_id == null || String(r.hole_id) === String(a.hole_id)) && Number(r.to) > lo && Number(r.from) < hi && asked.some((s) => r.values?.[s] != null))
      .sort((x, y) => (String(x.hole_id) < String(y.hole_id) ? -1 : String(x.hole_id) > String(y.hole_id) ? 1 : x.from - y.from));
    return { units: Object.fromEntries(asked.map((s) => [s, units[s] || ""])), ...pageOf(rows, a, (r) => ({ hole_id: r.hole_id, from: r3(r.from, 2), to: r3(r.to, 2), grades: Object.fromEntries(asked.map((s) => [s, Number.isFinite(r.values?.[s]) ? r3(r.values[s], 4) : null])) })) };
  },
  list_layers(snap) {
    return { layers: layerKeys(snap).map((k) => { const rows = snap.layers[k], counts = new Map(); for (const r of rows) { const v = typeof r.value === "number" ? null : String(r.value ?? ""); if (v) counts.set(v, (counts.get(v) || 0) + 1); } const dict = snap.codeDictionary || {}; return { key: k, label: layerLabel(k), intervals: rows.length, holes: new Set(rows.map((r) => r.hole_id)).size, numeric: rows.some((r) => typeof r.value === "number"), codes: [...counts].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([code, n]) => ({ code, intervals: n, ...(dict[k]?.[String(code).trim().toLowerCase()]?.desc ? { meaning: str(dict[k][String(code).trim().toLowerCase()].desc, 100) } : {}) })) }; }) };
  },
  get_layer_rows(snap, a) {
    const key = String(a.layer);
    if (!(snap.layers || {})[key] || !Array.isArray(snap.layers[key])) fail(`No layer '${str(key, 40)}'. Available: ${layerKeys(snap).join(", ") || "none"}.`);
    holeOf(snap, a.hole_id);
    const rows = snap.layers[key].filter((r) => String(r.hole_id) === String(a.hole_id)).sort((x, y) => x.from - y.from);
    return { layer: key, hole_id: a.hole_id, ...pageOf(rows, a, layerRowOut) };
  },
  grade_stats(snap, a) {
    const e = elementOrFail(snap, a.element), sym = e.symbol;
    const rows = labAssays(snap).filter((r) => Number.isFinite(r.values?.[sym]) && r.to > r.from);
    if (!rows.length) fail(`No assays of ${sym}.`);
    const stats = (set) => {
      const v = set.map((r) => r.values[sym]).sort((x, y) => x - y), w = set.reduce((t, r) => t + (r.to - r.from), 0), n = v.length, mean = v.reduce((t, x) => t + x, 0) / n;
      return { count: n, metres: r3(w, 1), mean: r3(mean, 4), length_weighted_mean: r3(set.reduce((t, r) => t + r.values[sym] * (r.to - r.from), 0) / w, 4), minimum: r3(v[0], 4), median: r3(percentile(v, 0.5), 4), maximum: r3(v[n - 1], 4), percentiles: { p90: r3(percentile(v, 0.9), 4), p95: r3(percentile(v, 0.95), 4), p97_5: r3(percentile(v, 0.975), 4), p99: r3(percentile(v, 0.99), 4), p99_5: r3(percentile(v, 0.995), 4) } };
    };
    const out = { element: sym, unit: e.unit || "", all: stats(rows), note: "Percentiles are the usual top-cut candidates; nothing is cut here." };
    if (a.domain_layer) {
      const key = String(a.domain_layer);
      if (!Array.isArray((snap.layers || {})[key])) fail(`No layer '${str(key, 40)}'. Available: ${layerKeys(snap).join(", ") || "none"}.`);
      const byHole = new Map(); for (const r of snap.layers[key]) { if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []); byHole.get(r.hole_id).push(r); }
      const groups = new Map();
      for (const r of rows) { const mid = (r.from + r.to) / 2, hit = (byHole.get(r.hole_id) || []).find((l) => l.from <= mid && mid < l.to), code = hit ? String(hit.value) : "(not logged)"; if (!groups.has(code)) groups.set(code, []); groups.get(code).push(r); }
      const list = [...groups].sort((x, y) => y[1].length - x[1].length);
      out.by_domain = { layer: key, domains: list.slice(0, 30).map(([code, set]) => ({ code, ...stats(set) })), ...(list.length > 30 ? { note: `The ${list.length - 30} smallest domains are left out.` } : {}) };
    }
    return out;
  },
  best_intercepts(snap, a) {
    const e = elementOrFail(snap, a.element), sym = e.symbol;
    if (!Number.isFinite(a.cutoff)) fail("'cutoff' is needed.");
    if (a.hole_id) holeOf(snap, a.hole_id);
    const comps = computeBestIntercepts(labAssays(snap), sym, e.unit || "ppm", unitsOf(snap), { cutoff: a.cutoff, maxInternalDilution: Number.isFinite(a.max_internal_dilution) ? a.max_internal_dilution : 2, minLength: Number.isFinite(a.min_length) ? a.min_length : 0 })
      .filter((r) => !a.hole_id || String(r.hole_id) === String(a.hole_id)).sort((x, y) => y.avgGrade * y.length - x.avgGrade * x.length);
    return { element: sym, unit: e.unit || "", cutoff: a.cutoff, rule: `Composited at ${a.cutoff} ${e.unit || ""} with at most ${Number.isFinite(a.max_internal_dilution) ? a.max_internal_dilution : 2} m of internal dilution; grades are uncut; best first by grade x length.`, ...pageOf(comps, a, (r) => ({ hole_id: r.hole_id, from: r3(r.from, 2), to: r3(r.to, 2), length: r3(r.length, 2), average_grade: r3(r.avgGrade, 4), assay_intervals: r.intervals })) };
  },
  list_sections(snap) {
    return { sections: (snap.sections || []).slice(0, MAX_ROWS).map(sectionOut) };
  },
  get_section(snap, a) {
    const key = String(a.section).toLowerCase(), s = (snap.sections || []).find((x) => String(x.name).toLowerCase() === key || String(x.id).toLowerCase() === key);
    if (!s) fail(`No section '${str(a.section, 60)}'. list_sections shows them.`);
    const A = { x: s.ax, y: s.ay }, B = { x: s.bx, y: s.by }, len = Math.hypot(B.x - A.x, B.y - A.y), corridor = Number(s.corridor) || 0;
    const traces = holeTraces(snap.collars, snap.survey, snap.desurveyMethod);
    const along = (x, y) => (len ? ((x - A.x) * (B.x - A.x) + (y - A.y) * (B.y - A.y)) / len : 0);
    const holes = [];
    for (const [id, trace] of traces) {
      const cr = corridorRuns(trace, A, B, corridor);
      if (!cr.runs.length) continue;
      const c = (snap.collars || []).find((x) => x.hole_id === id);
      holes.push({ hole_id: id, distance_along_section: r3(along(c.x, c.y), 1), collar_offset_from_line: r3(signedOffset(c.x, c.y, A, B), 1), collar_distance_to_line: r3(distToSegment(c.x, c.y, A.x, A.y, B.x, B.y), 1), depth_runs_in_corridor: cr.runs.slice(0, 6).map(([f, t]) => [r3(f, 1), r3(t, 1)]) });
    }
    holes.sort((x, y) => x.distance_along_section - y.distance_along_section);
    const out = { section: sectionOut(s), holes: holes.slice(0, MAX_ROWS), ...(holes.length > MAX_ROWS ? { note: `The first ${MAX_ROWS} of ${holes.length} holes.` } : {}), offset_sign: "positive = left of the line looking from its first end to its second" };
    if (a.element) {
      const inside = new Map(holes.map((h) => [h.hole_id, h.depth_runs_in_corridor]));
      const t = TOOLS.best_intercepts(snap, { element: a.element, cutoff: a.cutoff, limit: MAX_ROWS });
      out.intercepts = { element: t.element, unit: t.unit, cutoff: t.cutoff, rows: t.rows.filter((r) => inside.has(r.hole_id)).slice(0, 100), note: "Intercepts of the section's holes (the whole intercept, not only the part inside the corridor)." };
    }
    return out;
  },
};
const sectionOut = (s) => ({ name: str(s.name, 120), id: s.id, from: { easting: r3(s.ax, 1), northing: r3(s.ay, 1) }, to: { easting: r3(s.bx, 1), northing: r3(s.by, 1) }, azimuth: r3(s.azimuth, 1), length_m: r3(Math.hypot(s.bx - s.ax, s.by - s.ay), 1), corridor_half_width_m: r3(Number(s.corridor), 1) });

export const TOOL_NAMES = Object.keys(TOOLS);
// -> { ok: true, data, rows } | { ok: false, error }. Never throws, never writes.
export function runTool(name, args, snap) {
  try {
    if (!Object.prototype.hasOwnProperty.call(TOOLS, name)) return { ok: false, error: `Unknown tool: ${str(name, 40)}` };
    const a = args && typeof args === "object" && !Array.isArray(args) ? args : {};
    const why = refusal(a);
    if (why) return { ok: false, error: why };
    if (!snap || !Array.isArray(snap.collars)) return { ok: false, error: "No project is open in GeoStrix." };
    const data = scrubbed(TOOLS[name](snap, a));
    return { ok: true, data, rows: Array.isArray(data?.rows) ? data.rows.length : null };
  } catch (e) {
    return { ok: false, error: e instanceof ToolError ? e.message : "The tool could not read the project." }; // nothing from inside the app (a stack, a path) goes out
  }
}

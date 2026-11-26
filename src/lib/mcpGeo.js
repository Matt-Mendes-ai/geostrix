// TASKS.csv #4093 (AI app access, batch 5: geochem, geophysics and maps; Matt, 2026-11-25: 'build your first set, one tool for hole values, long runs as the grade tools').
// Piece A — what an AI app can read about the rasters, point surveys, surface samples and saved thresholds (list_rasters_surveys), the Thresholds pane's candidate rules
// (suggest_thresholds, read-only) and the one change that saves a candidate as the anomaly threshold (set_threshold). Pure functions over the same snapshot / store the other
// tools read (src/lib/mcpTools.js, mcpActions.js); nothing here reaches IPC, a file or the network. The threshold maths is the pane's own (lib/thresholds.js: populations,
// candidateThresholds, the scale and the default rule), run with the pane's defaults for the populations.
import { THRESHOLD_METHODS, ARITH_RULES, LOG_RULES, isLowRule, thresholdScale, candidateThresholds, populations, groupKeyFn, groupOptions, hasMixedSources, DRILL_DOMAINS, drillDomainKeyFn, intervalLength, thresholdUnreachable, usableDefaultMethod } from "./thresholds.js";
import { valueIn } from "./geochem.js";
import { fileCensoring } from "./qaqc.js";
import { localDate } from "./localDate.js";
import { rasterMethodOf, rasterUnitOf } from "./rasterMethod.js";
import { SURVEY_METHODS, surveyKey } from "./geophysSurveys.js";
import { t as tr } from "./i18n.js";

class GeoToolError extends Error { constructor(m) { super(m); this.toolMessage = true; } } // its message is for the app (mcpTools runTool, runChange)
const fail = (m) => { throw new GeoToolError(m); };
const str = (v, n) => String(v ?? "").slice(0, n);
const sig = (v, d = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(d)));
const CAP = 100; // rows of one list in an answer

// ---------------------------------------------------------------- list_rasters_surveys (read-only)
export function listRastersSurveys(snap) {
  const rasters = (snap.rasters || []).map((r) => {
    const m = rasterMethodOf(r, snap.geophysSurveys);
    return {
      id: str(r.id, 60), name: str(r.name, 120), kind: r.grid ? "grid" : "picture",
      ...(m ? { method: SURVEY_METHODS[m].label } : {}), ...(rasterUnitOf(r) ? { unit: str(rasterUnitOf(r), 24) } : {}),
      ...(r.grid ? { cells: `${r.grid.nx} x ${r.grid.ny}`, cell_m: sig(r.grid.dx) } : {}),
      visible: r.visible !== false, ...(r.provenance?.tool ? { made_by: str(r.provenance.tool, 100) } : r.filter?.label ? { made_by: str(r.filter.label, 100) } : {}),
    };
  });
  const counts = new Map();
  for (const p of snap.layers?.geophys_pts || []) { const k = surveyKey(p); counts.set(k, (counts.get(k) || 0) + 1); }
  const surveys = [...counts.entries()].map(([name, points]) => {
    const meta = snap.geophysSurveys?.[name] || {}, label = SURVEY_METHODS[meta.method]?.label;
    return { name: str(name, 120), points, ...(label ? { method: label } : {}), ...(meta.units ? { unit: str(meta.units, 24) } : {}) };
  });
  const samples = snap.surfaceSamples || [];
  const media = [...new Set(samples.map((s) => s.medium).filter(Boolean))].slice(0, 12).map((m) => str(m, 40));
  const thresholds = (snap.geochemThresholds || []).map((r) => ({ element: str(r.symbol, 32), source: r.source === "drill" ? "drill" : "surface", rule: str(r.methodLabel || r.method, 60), decided: str(r.decided, 12) }));
  const cut = (list) => list.slice(0, CAP);
  return {
    rasters: cut(rasters), point_surveys: cut(surveys),
    surface_samples: { n: samples.length, media, elements: (snap.surfaceElements || []).slice(0, 80).map((e) => ({ symbol: str(e.symbol, 32), unit: str(e.unit, 24) })) },
    thresholds: cut(thresholds),
    ...(rasters.length > CAP || surveys.length > CAP || thresholds.length > CAP ? { note: `Lists are cut at ${CAP}: ${rasters.length} rasters, ${surveys.length} point surveys, ${thresholds.length} thresholds in all.` } : {}),
  };
}

// ---------------------------------------------------------------- the Thresholds pane's populations and rules (suggest_thresholds, set_threshold)
// source: 'surface' (the surface samples) or 'drill' (the lab assays, length-weighted), the pane's default populations (medium / medium and source; all assays)
export function thresholdSetup(snap, a = {}) {
  const sym = str(a.element, 32).trim();
  const surfEls = snap.surfaceElements || [], drillEls = snap.assayElements || [];
  const find = (els) => els.find((e) => String(e.symbol).toLowerCase() === sym.toLowerCase());
  const source = a.source === "drill" || a.source === "surface" ? a.source : find(surfEls) ? "surface" : find(drillEls) ? "drill" : null;
  const el = source ? find(source === "drill" ? drillEls : surfEls) : null;
  if (!sym) fail("Give the element's symbol (list_rasters_surveys lists the surface elements, project_summary the assay ones).");
  if (!el) fail(`No element '${sym}' in the ${a.source === "drill" ? "drill assays" : a.source === "surface" ? "surface samples" : "surface samples or the drill assays"} of this project.`);
  const drill = source === "drill", symbol = el.symbol;
  const elements = drill ? drillEls : surfEls;
  const data = drill ? (snap.assays || []).filter((x) => intervalLength(x) != null) : (snap.surfaceSamples || []);
  if (!data.length) fail(drill ? "There are no drill assays with from / to depths to judge." : "There are no surface samples to judge.");
  const units = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  const unit = units[symbol] || "ppm";
  const groupBy = drill ? "none" : hasMixedSources(data) ? "medium_source" : new Set(data.map((s) => s.medium)).size > 1 ? "medium" : "none";
  const { floor } = fileCensoring(data, symbol, unit, units);
  const flaggedLt = (s) => !!s.bdl?.includes(symbol) || s.qualifiers?.[symbol] === "<";
  const keyOf = drill ? drillDomainKeyFn(groupBy, snap.layers || {}) : groupKeyFn(groupBy, snap.mapLayers || [], data);
  const pops = populations(data, {
    valueOf: (s) => valueIn(s, symbol, unit, units),
    censoredOf: (s) => flaggedLt(s) || (floor != null && Math.abs(valueIn(s, symbol, unit, units) - floor.floor) <= floor.floor * 1e-9),
    zeroOf: (s) => !!s.nd?.includes(symbol), keyOf, ...(drill ? { weightOf: intervalLength } : {}),
  }).map((p) => ({ ...p, cand: candidateThresholds(p.summary) }));
  if (!pops.length) fail(`No ${symbol} values above zero to judge.`);
  const logOn = thresholdScale(pops, unit) === "log";
  const shown = logOn ? THRESHOLD_METHODS.filter((m) => !ARITH_RULES.has(m.id)) : THRESHOLD_METHODS.filter((m) => !LOG_RULES.has(m.id));
  const unreachable = (id) => pops.filter((p) => thresholdUnreachable(p.cand.values[id], p.summary, unit, isLowRule(id)));
  const groupLabel = drill ? DRILL_DOMAINS.find((d) => d.value === groupBy)?.label || groupBy : groupOptions(data, snap.mapLayers || []).find((o) => o.value === groupBy)?.label || groupBy;
  const saved = (snap.geochemThresholds || []).find((r) => r.symbol === symbol && (r.source === "drill") === drill) || null;
  return { symbol, unit, source, drill, groupBy, groupLabel, pops, logOn, shown, unreachable, saved, suggested: usableDefaultMethod(pops, logOn ? "median2mad" : null, unit) };
}

export function suggestThresholds(snap, a = {}) {
  const t = thresholdSetup(snap, a);
  const populationsOut = t.pops.slice(0, 12).map((p) => ({
    population: str(p.key, 80), n: p.summary.n, censored_percent: sig(p.summary.censoredPct, 3), ...(p.zero ? { reported_zero: p.zero } : {}),
    rules: Object.fromEntries(t.shown.map((m) => [m.id, sig(p.cand.values[m.id])])),
  }));
  return {
    element: t.symbol, source: t.source, unit: t.unit, populations_by: t.groupLabel, scale: t.logOn ? "log" : "arithmetic",
    rules: t.shown.map((m) => ({ id: m.id, label: m.label, assumption: m.assumption, ...(isLowRule(m.id) ? { direction: "below" } : {}), cannot_reach: t.unreachable(m.id).map((p) => str(p.key, 80)).slice(0, 6) })),
    populations: populationsOut, ...(t.pops.length > 12 ? { note: `The 12 largest of ${t.pops.length} populations.` } : {}),
    suggested_rule: t.suggested, saved: t.saved ? { rule: str(t.saved.methodLabel, 60), decided: str(t.saved.decided, 12) } : null,
    reminder: "These are candidate rules from your data, not facts: the geologist decides what is anomalous. A percentile flags its share whether or not anything is anomalous. set_threshold saves one.",
  };
}

// ---------------------------------------------------------------- set_threshold (a change): saves one candidate rule as the element's anomaly threshold, as the pane's Save does
// Nothing is replaced: a rule already saved for the element (and source) is refused.
export function setThreshold(a, s) {
  let t;
  try { t = thresholdSetup(s, a); } catch (e) { return { ok: false, error: e.message }; }
  const m = THRESHOLD_METHODS.find((x) => x.id === a.rule);
  if (!m) return { ok: false, error: `Unknown rule '${str(a.rule, 24)}'. suggest_thresholds lists the rule ids (${t.shown.map((x) => x.id).join(", ")}).` };
  if (!t.shown.some((x) => x.id === m.id)) return { ok: false, error: `${m.label} does not apply to ${t.symbol} here: it reads on ${t.logOn ? "log" : "arithmetic"} axes, so use one of ${t.shown.map((x) => x.id).join(", ")}.` };
  if (t.saved) return { ok: false, error: `A ${t.drill ? "drill" : "surface"} threshold for ${t.symbol} is already saved (${str(t.saved.methodLabel, 60)}, decided ${str(t.saved.decided, 12)}). GeoStrix does not replace it: change or clear it in Thresholds.` };
  const bad = t.unreachable(m.id);
  if (bad.length) return { ok: false, error: `${m.label} gives no usable value for ${bad.slice(0, 3).map((p) => `'${str(p.key, 60)}'`).join(", ")} (${isLowRule(m.id) ? "below" : "above"} every sample, or missing): choose another rule.` };
  const rec = {
    symbol: t.symbol, unit: t.unit, groupBy: t.groupBy, groupLabel: t.groupLabel, method: m.id, methodLabel: m.label, ref: m.ref,
    values: Object.fromEntries(t.pops.map((p) => [p.key, p.cand.values[m.id] ?? null])),
    n: Object.fromEntries(t.pops.map((p) => [p.key, p.summary.n])),
    censoredPct: Object.fromEntries(t.pops.map((p) => [p.key, Math.round(p.summary.censoredPct * 10) / 10])),
    ...(t.pops.some((p) => p.zero) ? { reportedZero: Object.fromEntries(t.pops.map((p) => [p.key, p.zero])) } : {}),
    decided: localDate(),
    ...(isLowRule(m.id) ? { direction: "below" } : {}),
    ...(t.drill ? { source: "drill", weighting: "length" } : {}),
  };
  s.setGeochemThresholds((prev) => [...(prev || []), rec]);
  const symbol = t.symbol, drill = t.drill;
  return {
    ok: true, tracked: true, // the thresholds are in the undo history (Ctrl+Z); the toast's Undo takes out exactly this record
    data: { changed: "anomaly threshold", element: symbol, source: t.source, rule: m.id, rule_label: m.label, unit: t.unit, populations: t.pops.slice(0, 12).map((p) => ({ population: str(p.key, 80), n: p.summary.n, threshold: sig(p.cand.values[m.id]) })), ...(isLowRule(m.id) ? { direction: "below" } : {}) },
    say: tr("saved {symbol}'s {rule} threshold", { rule: m.label, symbol }),
    revert: (st) => st.setGeochemThresholds((prev) => (prev || []).filter((r) => !(r.symbol === symbol && (r.source === "drill") === drill && r.method === m.id && r.decided === rec.decided))),
  };
}

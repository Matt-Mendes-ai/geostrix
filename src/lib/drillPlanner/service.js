// TASKS.csv #3962 (P5) — the drill planner from a store (or a store snapshot), for the AI-app tools (lib/drillPlanner/mcpPlanner.js): the same
// steps the Probable grade panel and the Drill program section take (composites as Grade estimation makes them, the normal-score model
// in a worker, the program over the drilled pads), without the interface. Anywhere the model reaches: a target solid is the 3D view's,
// which an AI app cannot pick.
import { rowsOf } from "../rowTable.js";
import { excludeQAQC } from "../qaqc.js";
import { desurveyHole } from "../desurvey.js";
import { plannedTrace } from "../plannedTrace.js";
import { compositeDownholeSliced, samplePointsSliced } from "../compositeSliced.js";
import { drilledCollars } from "../collarStatus.js";
import { drilledSiteSpacing } from "../evidenceSources.js";
import { minSpacingFrom } from "../plannedHoleChecks.js";
import { estimateSources, freshSource, suggestedCutoff } from "./predictionInputs.js";
import { padsFromCollars, candidateHoles, PROGRAM_DEFAULTS, RULES } from "./program.js";
import { runPlanner, runProgram } from "./drillPlannerClient.js";

// the answers' protective lines (English: what an AI app reads and passes on)
export const CAUTIONS = [
  "Exploration targeting, not a resource estimate: no figure here is a Mineral Resource under NI 43-101 or JORC; per-hole grade x metres only, no tonnes.",
  "The P10-P90 range comes from the spacing of the holes and the variogram only, not from the geology being wrong.",
  "A suggestion by the chosen rule, not an optimum: the geologist decides. Nothing is drilled, linked or deleted by an AI app.",
];

// s: { assays, assayElements, collars, survey, desurveyMethod, voxelModels }; element: a symbol, or the newest Grade estimation run's
// -> { source, unit, step, model, values, points } | { error }
export async function prepareGrade(s, { element = null } = {}) {
  const elems = (s.assayElements || []).map((e) => e.symbol);
  const units = Object.fromEntries((s.assayElements || []).map((e) => [e.symbol, e.unit]));
  const est = estimateSources(s.voxelModels || []);
  let source = element ? est.find((e) => e.element.toLowerCase() === String(element).toLowerCase()) : est[0];
  if (!source) {
    const sym = element ? elems.find((x) => x.toLowerCase() === String(element).toLowerCase()) : elems[0];
    if (!sym) return { error: element ? `No element '${String(element).slice(0, 32)}' in the assays. project_summary lists them.` : "The project has no assays." };
    source = freshSource(sym, units[sym]);
  }
  const unit = source.unit || units[source.element] || "", step = source.compositeLengthM || 2;
  const intervals = await compositeDownholeSliced(excludeQAQC(rowsOf(s.assays)), source.element, unit, units, { length: step, minCoverage: source.minCoverage, capValue: source.capValue });
  const { points } = await samplePointsSliced(intervals, s.collars, s.survey, desurveyHole, s.desurveyMethod);
  const values = points.map((p) => p.value).filter(Number.isFinite);
  const model = await runPlanner({ kind: "fit", points: points.map((p) => ({ x: p.x, y: p.y, z: p.z, value: p.value, hole_id: p.hole_id })), modelType: source.vgModel, searchTrend: source.searchTrend });
  if (model.error) return { error: model.error === "few" ? `Too few ${source.element} composites for a grade model (${model.n}).` : `No variogram fits the ${source.element} normal scores: too few pairs.` };
  return { source, unit, step, model, values, points };
}

// the intercept rules: the given ones, else the panel's defaults (the upper quartile; twice and once the composite length)
export const rulesFrom = (prep, a = {}) => ({ cutoff: Number(a.cutoff) > 0 ? Number(a.cutoff) : suggestedCutoff(prep.values), minLength: Number(a.min_length) >= 0 && a.min_length != null ? Number(a.min_length) : 2 * prep.step, maxInternalDilution: Number(a.internal_dilution) >= 0 && a.internal_dilution != null ? Number(a.internal_dilution) : prep.step });

// one hole's 200-run prediction: hole { x, y, z, azimuth, dip, length, lift?, drift? }
export async function predictOne(prep, hole, rules) {
  const trace = plannedTrace(hole).map((p) => ({ md: p.md, x: p.x, y: p.y, z: p.z }));
  const r = await runPlanner({ kind: "predict", model: prep.model, holes: [{ id: "h", trace }], rules, opts: { step: prep.step, searchRadius: prep.source.searchRadiusM || prep.model.vg.range } });
  return r.h;
}

// the program over the drilled pads, as the section's defaults; a: the tool's arguments -> { inputs, rules, r (selectProgram), preds, candidates } | { error }
export async function suggestProgram(s, prep, a = {}) {
  const rules = rulesFrom(prep, a);
  const drilled = drilledCollars(s.collars).collars, pads = padsFromCollars(drilled);
  if (!pads.length) return { error: "The project has no drilled collars to plan from." };
  const azStep = Math.max(5, Math.min(180, Number(a.azimuth_step) || PROGRAM_DEFAULTS.azStep));
  const dips = (Array.isArray(a.dips) ? a.dips.map(Number).filter((d) => d < 0 && d >= -90) : []).slice(0, 8);
  const rates = s.project?.drillRates || {};
  const hasRate = Object.entries(rates).some(([k, v]) => !k.startsWith("__") && Number(v) > 0);
  const inputs = {
    target: null, pads: pads.map((p) => ({ x: p.x, y: p.y })), newPads: [], azStep, dips: dips.length ? dips : PROGRAM_DEFAULTS.dips, maxLength: Math.max(10, Math.min(2000, Number(a.max_length) || PROGRAM_DEFAULTS.maxLength)), type: String(a.hole_type || "").slice(0, 16),
    limits: { maxHoles: Math.max(1, Math.min(50, Number(a.max_holes) || PROGRAM_DEFAULTS.maxHoles)), perPad: Number(a.holes_per_pad) > 0 ? Number(a.holes_per_pad) : PROGRAM_DEFAULTS.perPad, maxMetres: Number(a.max_metres) > 0 ? Number(a.max_metres) : 0, budget: hasRate && Number(a.budget) > 0 ? Number(a.budget) : 0 },
    minSpacing: minSpacingFrom(drilledSiteSpacing(s.collars)) || 0, rule: RULES.includes(a.rule) ? a.rule : "balanced", kappa: Number.isFinite(Number(a.kappa)) && a.kappa != null ? Math.max(0, Math.min(2, Number(a.kappa))) : PROGRAM_DEFAULTS.kappa,
  };
  const azimuths = []; for (let x = 0; x < 360 - 1e-9; x += azStep) azimuths.push(Math.round(x * 10) / 10);
  const { candidates, capped, total } = candidateHoles(pads, { azimuths, dips: inputs.dips, maxLength: inputs.maxLength, minLength: rules.minLength });
  if (capped) return { error: `${total} candidates, over ${PROGRAM_DEFAULTS.maxCandidates}: use a coarser azimuth_step or fewer dips.` };
  const pts = prep.points;
  const drilledPts = { x: Float64Array.from(pts, (p) => p.x), y: Float64Array.from(pts, (p) => p.y), z: Float64Array.from(pts, (p) => p.z), ids: pts.map((p) => String(p.hole_id)) };
  const searchRadius = prep.source.searchRadiusM || prep.model.vg.range;
  const r = await runProgram({ kind: "program", model: prep.model, candidates, rules, opts: { rule: inputs.rule, kappa: inputs.kappa, step: prep.step, searchRadius, minSpacing: inputs.minSpacing, rates, type: inputs.type, pads: {}, drilled: drilledPts, limits: inputs.limits } });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const preds = r.chosen.length ? await runPlanner({ kind: "predict", model: prep.model, holes: r.chosen.map((h) => ({ id: h.id, trace: byId.get(h.id).trace })), rules, opts: { step: prep.step, searchRadius } }) : {};
  return { inputs, rules, r, preds, candidates: candidates.length, padNames: Object.fromEntries(pads.map((p) => [p.id, p.holes.length > 1 ? `${p.holes[0]} pad (+${p.holes.length - 1})` : `${p.holes[0]} pad`])) };
}

// a hole's reason, in English (the Why of the section, project text and answers)
export function whyEnglish(h, range) {
  const f = h.facts, p = Math.round((f.pHit || 0) * 100);
  if (!f.nearestHole) return "Far from the drilling: the model knows little there.";
  if (f.unknown != null && f.unknown >= 0.6) return `Into ground the model knows little, ${f.nearestM} m from ${f.nearestHole}.`;
  if (f.pHit >= 0.6 && f.nearestM <= (range || Infinity) / 2) return `Near known grade, ${f.nearestM} m from ${f.nearestHole}: a ${p} % chance of an intercept.`;
  return `Between holes, ${f.nearestM} m from ${f.nearestHole}: a ${p} % chance of an intercept.`;
}

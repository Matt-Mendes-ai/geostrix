// TASKS.csv #3962 (P5) — the drill planner's AI-app tools (design.md 4.2; #3932's pattern): four reads and three changes.
//  Reads (no switch needed): list_drill_programs, get_drill_program, explain_hole (from the project snapshot) and predict_hole (computes:
//  the composites and the grade model, as the Probable grade panel; a read, it changes nothing).
//  Changes (only with 'Allow AI apps to make changes'; each one Undo step, through mcpActions.runChange): run_drill_planner (long: it
//  saves a suggested program and adds no hole), add_program_holes (the suggested holes as proposed planned holes, named by the project's
//  series, each with its prediction), set_planned_hole_status (proposed / approved; never drilled, which only a real as-drilled link sets).
//  Never offered: deleting holes or programs, linking a drilled hole, changing assays.
// The AI suggests; the geologist decides. Every answer carries the cautions (service.js CAUTIONS) verbatim.
import { calibration, dataStamp } from "./adaptive.js";
import { holeGeometryKey, modelStamp, predictionRecord, predictionState } from "./predictionInputs.js";
import { assayStamp } from "../assayStamp.js";
import { rowsOf } from "../rowTable.js";
import { nextHoleId } from "../holeSeries.js";
import { drilledCollars } from "../collarStatus.js";
import { t as tr } from "../i18n.js"; // the toast in GeoStrix (the answer to the app stays English)

export const PLANNER_CAUTIONS = [
  "Exploration targeting, not a resource estimate: no figure here is a Mineral Resource under NI 43-101 or JORC; per-hole grade x metres only, no tonnes.",
  "The P10-P90 range comes from the spacing of the holes and the variogram only, not from the geology being wrong.",
  "A suggestion by the chosen rule, not an optimum: the geologist decides. Nothing is drilled, linked or deleted by an AI app.",
];
const r3 = (v, d = 3) => (Number.isFinite(Number(v)) ? Number(Number(v).toFixed(d)) : null);
const sig = (v) => (Number.isFinite(Number(v)) ? Number(Number(v).toPrecision(4)) : null);
const band3 = (a) => (Array.isArray(a) ? { low_p10: sig(a[0]), middle_p50: sig(a[1]), high_p90: sig(a[2]) } : null);
class PlannerError extends Error { constructor(m) { super(m); this.toolMessage = true; } } // its message is for the app (mcpTools runTool)
const fail = (m) => { throw new PlannerError(m); };
export const isPlannerError = (e) => e instanceof PlannerError;

// a prediction (frozen record or a fresh one) as an answer
export function predictionOut(p) {
  if (!p) return null;
  if (p.beyond) return { beyond_the_drilling: true, note: "No composite within the search: no prediction, never the average." };
  return {
    element: p.element, unit: p.unit, cutoff: p.rules?.cutoff, min_length_m: p.rules?.minLength, internal_dilution_m: p.rules?.maxInternalDilution,
    chance_of_an_intercept: r3(p.pHit, 3), grade_x_metres: band3(p.gt), expected_grade_x_metres: sig(p.gtMean),
    typical_hit: p.hitLength ? { length_m: sig(p.hitLength[1]), grade: sig(p.hitGrade?.[1]) } : null, runs: p.realizations ?? null, made: p.date ? String(p.date).slice(0, 10) : null,
  };
}
const holeOut = (h) => ({ id: h.id, name: h.name, status: h.status || "proposed", easting: r3(h.x, 2), northing: r3(h.y, 2), elevation: r3(h.z, 2), azimuth: r3(h.azimuth, 1), dip: r3(h.dip, 1), length_m: r3(h.length, 1), hole_type: h.type || "", as_drilled_hole: h.asDrilledHoleId || null });
const findHole = (snap, key) => {
  const k = String(key ?? "").toLowerCase();
  return (snap.plannedHoles || []).find((h) => String(h.id).toLowerCase() === k || String(h.name || "").toLowerCase() === k) || fail(`No planned hole '${String(key ?? "").slice(0, 64)}'. list_drill_programs or get_drill_program list them.`);
};
const stampOf = (snap) => dataStamp(assayStamp(rowsOf(snap.assays)), snap.collars);

// ——— reads ———
export function list_drill_programs(snap) {
  const now = stampOf(snap);
  const programs = (snap.project?.drillPrograms || []).map((p) => {
    const mine = (snap.plannedHoles || []).filter((h) => h.programId === p.id), v = p.versions[p.versions.length - 1];
    return { program_id: p.id, made: String(p.date).slice(0, 10), element: p.element, unit: p.unit, rule: p.rule, versions: p.versions.length,
      suggested_holes: v.holes.length, added: mine.length > 0, planned_holes: mine.length, drilled: mine.filter((h) => h.asDrilledHoleId).length, new_data_since: v.stamp !== now, suggested_by: p.by || null };
  });
  return { programs, cautions: PLANNER_CAUTIONS };
}

export function get_drill_program(snap, a) {
  const p = (snap.project?.drillPrograms || []).find((x) => x.id === a.program_id) || fail(`No program '${String(a.program_id ?? "").slice(0, 64)}'. list_drill_programs lists them.`);
  const v = a.version != null ? p.versions.find((x) => x.n === Number(a.version)) || fail(`Program ${p.id} has no version ${a.version}.`) : p.versions[p.versions.length - 1];
  const mine = (snap.plannedHoles || []).filter((h) => h.programId === p.id);
  const holes = v.holes.map((h) => {
    const planned = h.plannedId ? mine.find((x) => x.id === h.plannedId) : null;
    return { order: h.order, above_the_line: v.line == null ? true : h.order <= v.line, pad: h.pad || null, easting: r3(h.x, 2), northing: r3(h.y, 2), azimuth: r3(h.azimuth, 1), dip: r3(h.dip, 1), length_m: r3(h.length, 1), cost: h.cost != null ? Math.round(h.cost) : null, score: sig(h.score),
      why: h.why || (planned?.notes ? String(planned.notes).replace(/^Suggested by the drill program \([^)]*\):\s*/, "") : null),
      prediction: predictionOut(planned?.prediction || h.prediction), planned_hole: planned ? holeOut(planned) : null, drilled_result: planned?.actual ? { grade_x_metres: planned.actual.gt, against_the_range: planned.actual.where } : null };
  });
  const cal = calibration(mine.map((h) => h.actual));
  return { program_id: p.id, made: String(p.date).slice(0, 10), element: p.element, unit: p.unit, rule: p.rule, kappa: p.kappa, version: v.n, versions: p.versions.length, added: mine.length > 0,
    changes: v.changes || null, holes, calibration: cal.n ? { drilled_holes_compared: cal.n, inside_their_range: cal.inside, below: cal.below, above: cal.above, overconfident: cal.overconfident } : null,
    new_data_since: v.stamp !== stampOf(snap), cautions: PLANNER_CAUTIONS };
}

export function explain_hole(snap, a) {
  const h = findHole(snap, a.hole);
  const drilled = drilledCollars(snap.collars || []).collars;
  let near = null;
  for (const c of drilled) { const d = Math.hypot(Number(c.x) - h.x, Number(c.y) - h.y); if (!near || d < near.d) near = { id: c.hole_id, d }; }
  const prog = (snap.project?.drillPrograms || []).find((p) => p.id === h.programId);
  return {
    hole: holeOut(h), program_id: prog?.id || null, reason: h.notes ? String(h.notes).slice(0, 400) : null,
    nearest_drilled_collar: near ? { hole_id: near.id, distance_m: Math.round(near.d) } : null,
    prediction: predictionOut(h.prediction), prediction_state: predictionState(h) === "moved" ? "the hole has moved since the prediction was made" : predictionState(h) === "kept" ? "drilled: the prediction is kept as it was made" : predictionState(h) === "none" ? "not predicted yet (Probable grade in GeoStrix, or predict_hole)" : "current",
    drilled_result: h.actual ? { as_drilled_hole: h.actual.hole, grade_x_metres: h.actual.gt, against_the_range: h.actual.where } : null,
    cautions: PLANNER_CAUTIONS,
  };
}

// computes (the grade model), so it is async; a read all the same
export async function predict_hole(snap, a) {
  const { prepareGrade, predictOne, rulesFrom } = await import("./service.js");
  let hole;
  if (a.hole != null) hole = findHole(snap, a.hole);
  else {
    const c = a.collar || {};
    if (![c.easting, c.northing, c.elevation, a.azimuth, a.dip, a.length].every((v) => Number.isFinite(Number(v)))) fail("Give 'hole' (a planned hole's id or name), or 'collar' { easting, northing, elevation } with 'azimuth', 'dip' (negative down) and 'length'.");
    if (!(Number(a.dip) < 0) || !(Number(a.length) > 0) || Number(a.length) > 3000) fail("'dip' is negative for a hole pointing down, and 'length' is 0-3000 m.");
    hole = { x: Number(c.easting), y: Number(c.northing), z: Number(c.elevation), azimuth: Number(a.azimuth), dip: Number(a.dip), length: Number(a.length) };
  }
  const prep = await prepareGrade(snap, { element: a.element });
  if (prep.error) fail(prep.error);
  const rules = rulesFrom(prep, a);
  const p = await predictOne(prep, hole, rules);
  const out = predictionOut(p && !p.beyond ? { ...p, element: prep.source.element, unit: prep.unit, rules } : p);
  return { hole: a.hole != null ? holeOut(hole) : { easting: hole.x, northing: hole.y, elevation: hole.z, azimuth: hole.azimuth, dip: hole.dip, length_m: hole.length }, prediction: out,
    model: { composites: prep.model.n, holes: prep.model.holes, variogram: prep.model.vg.model, range_m: r3(prep.model.vg.range, 1), nugget_share: r3(prep.model.vg.nugget, 2), fit_r2: r3(prep.model.fit.rSquared, 2), weak_fit: !!prep.model.fit.weak, settings_from: prep.source.name ? `Grade estimation run "${prep.source.name}"` : `${prep.step} m composites, fitted now` },
    note: "Not kept: Probable grade in GeoStrix keeps a planned hole's prediction on it.", cautions: PLANNER_CAUTIONS };
}

// ——— changes (mcpActions.runChange calls them with the live store; each returns { ok, data, say, tracked } or { ok: false, error }) ———
export async function run_drill_planner(a, s, { client = "An AI app" } = {}) {
  const { prepareGrade, suggestProgram, whyEnglish } = await import("./service.js");
  const prep = await prepareGrade(s, { element: a.element });
  if (prep.error) return { ok: false, error: prep.error };
  if (prep.model.fit.weak && a.accept_weak_fit !== true) return { ok: false, error: `The variogram of the ${prep.source.element} normal scores fits weakly (r² ${r3(prep.model.fit.rSquared, 2)}): the ranges will be less reliable. Ask the user, then call again with accept_weak_fit: true.` };
  const sp = await suggestProgram(s, prep, a);
  if (sp.error) return { ok: false, error: sp.error };
  const { r, preds, rules, inputs } = sp;
  if (!r.chosen.length) return { ok: false, error: "No hole fits the limits." };
  const date = new Date().toISOString(), stamp = modelStamp(prep.source, prep.model, prep.values), id = `prog_${Date.now().toString(36)}`;
  const holes = r.chosen.map((h) => {
    const geo = { x: h.x, y: h.y, z: h.z, azimuth: h.azimuth, dip: h.dip, length: h.length };
    const pred = preds[h.id];
    return { order: h.order, pad: sp.padNames[h.pad] || h.pad, ...geo, cost: h.cost, money: h.money, score: h.score, why: whyEnglish(h, prep.model.vg.range), prediction: pred ? predictionRecord(pred, { source: prep.source, model: prep.model, rules, hole: geo, stamp, date }) : null };
  });
  const prog = { id, date, element: prep.source.element, unit: prep.unit, rule: inputs.rule, kappa: inputs.kappa, inputs, scenario: true, by: String(client).slice(0, 60),
    versions: [{ n: 1, date, stamp: dataStamp(assayStamp(rowsOf(s.assays)), s.collars), line: r.line, holes }] };
  s.setDrillPrograms((ps) => [...ps, prog]);
  const last = r.chosen[r.chosen.length - 1];
  return { ok: true, tracked: true, say: tr("suggested a drill program: {n} holes, not added", { n: holes.length }),
    // short, as every change's answer: the holes, their reasons and predictions are get_drill_program's
    data: { changed: "a suggested program (no hole added)", program_id: id, holes: holes.length, above_the_line: r.line, metres: Math.round(last.cumMetres), cost: Math.round(last.cumCost), cost_unit: last.money ? (s.project?.currency || "$") : "m",
      next: "get_drill_program for the holes, reasons and predictions; add_program_holes after the user agrees. Targeting, not a resource estimate." } };
}

export function add_program_holes(a, s) {
  const p = (s.project?.drillPrograms || []).find((x) => x.id === a.program_id);
  if (!p) return { ok: false, error: `No program '${String(a.program_id ?? "").slice(0, 64)}'. list_drill_programs lists them.` };
  // "added" is whether its planned holes exist (a project field is outside the undo history: one Undo takes the holes back and the program can be added again)
  if ((s.plannedHoles || []).some((h) => h.programId === p.id)) return { ok: false, error: "This program's holes were already added. Re-run it in GeoStrix (Drill program) to change it." };
  const v = p.versions[p.versions.length - 1];
  const pick = String(a.holes ?? "all").trim().toLowerCase(), orders = pick.split(/[\s,;]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0);
  const want = pick === "above_line" ? v.holes.filter((h) => v.line == null || h.order <= v.line) : pick === "all" || !pick ? v.holes : v.holes.filter((h) => orders.includes(h.order));
  if (!want.length) return { ok: false, error: "No hole of the program matches 'holes' ('all', 'above_line', or order numbers such as '1,2,5')." };
  const ids = [...(s.collars || []).map((c) => c.hole_id), ...(s.plannedHoles || []).map((h) => h.name)], names = [];
  for (let i = 0; i < want.length; i++) { let n = nextHoleId(ids); if (!n) { let k = (s.plannedHoles || []).length + i + 1; while (ids.includes(`PLAN-${k}`)) k++; n = `PLAN-${k}`; } names.push(n); ids.push(n); }
  const added = want.map((h, k) => {
    const hole = { name: names[k], x: h.x, y: h.y, z: h.z, azimuth: h.azimuth, dip: h.dip, length: h.length, type: p.inputs?.type || "", programId: p.id, status: "proposed", notes: `Suggested by the drill program (${p.rule}, #${h.order}, via ${p.by || "an AI app"}): ${h.why}` };
    // the prediction made with the suggestion, for this geometry (frozen with it)
    const pred = h.prediction ? { ...h.prediction, geometry: holeGeometryKey(hole) } : null;
    return { plannedId: s.addPlannedHole({ ...hole, ...(pred ? { prediction: pred } : {}) }), order: h.order, name: names[k] };
  });
  s.setDrillPrograms((ps) => ps.map((x) => (x.id !== p.id ? x : { ...x, versions: x.versions.map((vv) => (vv.n !== v.n ? vv : { ...vv, holes: vv.holes.map((h) => { const m = added.find((q) => q.order === h.order); return m ? { ...h, plannedId: m.plannedId } : h; }) })) })));
  return { ok: true, tracked: true, say: added.length === 1 ? tr("added planned hole {name}", { name: added[0].name }) : tr("added planned holes {a} to {b}", { a: added[0].name, b: added[added.length - 1].name }),
    data: { changed: "planned holes added (proposed)", program_id: p.id, holes: added.map((x) => ({ order: x.order, name: x.name, id: x.plannedId })), cautions: PLANNER_CAUTIONS } };
}

export function set_planned_hole_status(a, s) {
  if (!["proposed", "approved"].includes(a.status)) return { ok: false, error: "'status' is 'proposed' or 'approved'; a hole becomes drilled only when the geologist links its as-drilled hole in GeoStrix." };
  const k = String(a.hole ?? "").toLowerCase();
  const h = (s.plannedHoles || []).find((x) => String(x.id).toLowerCase() === k || String(x.name || "").toLowerCase() === k);
  if (!h) return { ok: false, error: `No planned hole '${String(a.hole ?? "").slice(0, 64)}'.` };
  if (h.asDrilledHoleId) return { ok: false, error: `${h.name} is drilled (linked to ${h.asDrilledHoleId}): its status stays drilled.` };
  s.updatePlannedHole(h.id, { status: a.status });
  return { ok: true, tracked: true, say: a.status === "approved" ? tr("marked {name} approved", { name: h.name }) : tr("marked {name} proposed", { name: h.name }), data: { changed: "a planned hole's status", hole: h.name, status: a.status } };
}

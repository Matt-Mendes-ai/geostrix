// TASKS.csv #3908 (the #3901 redesign, batch P7a) — the guided tools: each is one sentence, one question answered from the data first, and
// a "Build it for me" that runs an existing engine (the stack and implicit runs of modellingRuns.js) with settings from src/lib/auto/.
// A tool is a plain object; GuidedTool.jsx draws every one the same way. English strings are tr() keys, translated where they are drawn.
//
// ctx: { rows (the lithology log rows), intercepts() (desurveyed tops of each logged interval, lib/viewer/boundaryIntercepts.js), collars,
//        hasTerrain, describe(code), roleOf(code), isCover(code), target(code): the run's key (mcode:<code> when Modelling codes name it) }
// tool: { id, title, line, sentence, question, multi, help, expertPane,
//         feed(ctx) -> null | why it cannot (a sentence), suggest(ctx) -> { value, reason }, choices(ctx) -> [unit],
//         contacts(ctx, value) -> the contacts autoSurface sizes the model from, check(ctx, value) -> null | why it cannot,
//         notes(ctx, value) -> [sentence], run(api, value), prefill(api, value) }
import { stackOrder, suggestBody, suggestCover } from "../../../lib/auto/autoUnits.js";
import { t as tr, fmtNum } from "../../../lib/i18n.js";
import { autoGradeShell } from "../../../lib/auto/autoGradeShell.js";
import { autoBlockModel } from "../../../lib/auto/autoBlockModel.js";
import { computeMeshVolume } from "../../../lib/volumetrics.js";
import { faultPlan, minutesOf } from "../../../lib/auto/autoFault.js";
import { gempyRate } from "../../../lib/gempyLimits.js";
import { gradeUnitLabel } from "../../../lib/geochemColumns.js";

const noLogs = (ctx) => (ctx.rows.length ? null : tr("No lithology log yet: import one (Add data) and this tool reads it."));
const unitsByHoles = (ctx) => stackOrder(ctx.rows).units.map((u) => u.unit);

export const ROCK_LAYERS = {
  id: "layers",
  title: "Rock layers",
  line: "Rocks that stack like pages.",
  sentence: "Builds the surfaces between rocks that lie in layers, one under the other, from the contacts in your logs.",
  question: "Which rocks form layers?",
  multi: true,
  help: "stratigraphic-stack",
  expertPane: "stack",
  feed: noLogs,
  suggest(ctx) {
    const s = stackOrder(ctx.rows);
    return s.order.length >= 2
      ? { value: s.order, reason: tr("These {n} rocks lie in the same order, top to bottom, in most of the holes that cut them.", { n: s.order.length }) }
      : { value: s.order, reason: tr("Fewer than two rocks lie in a steady order down the holes: tick the ones that form layers.") };
  },
  // the layered ones first, in their order, then the rest by how many holes cut them
  choices(ctx) { const s = stackOrder(ctx.rows); return [...s.order, ...s.units.map((u) => u.unit).filter((u) => !s.order.includes(u))]; },
  ordered(ctx, picked) { const s = stackOrder(ctx.rows), rank = [...s.order, ...s.bodies, ...s.units.map((u) => u.unit)]; return [...picked].sort((a, b) => rank.indexOf(a) - rank.indexOf(b)); },
  check: (ctx, value) => (value.length >= 2 ? null : tr("Tick at least two rocks: a layer is drawn between two of them.")),
  contacts: (ctx, value) => ctx.intercepts().filter((c) => value.includes(String(c.unit))),
  notes: () => [],
  run: (api, value) => api.runStackModel(value),
  prefill: (api, value) => api.setStackUnits(value),
};

// TASKS.csv #3908 step 3 — one rock as a shape that cuts the others: the implicit run on that unit. The run draws a cross-cutting shape only
// for a rock it reads as one (a dyke, vein, breccia or intrusion: its name, or its role in Modelling codes); any other rock it draws as the
// top of a layer, so the tool says where to mark it instead of building the wrong surface (found live on WA lode gold: "cl").
const BODY_ROLES = new Set(["dyke", "vein", "breccia", "intrusion", "cross-cutting"]);
export const BODIES = {
  id: "bodies",
  title: "Intrusions and bodies",
  line: "One rock as a solid shape that cuts through the others.",
  sentence: "Builds one rock as a solid shape from where the holes cut it: an intrusion, a dyke, a breccia body.",
  question: "Which rock?",
  multi: false,
  help: "implicit-surface",
  expertPane: "implicit",
  feed: noLogs,
  suggest(ctx) {
    const b = suggestBody(ctx.rows, (u) => BODY_ROLES.has(ctx.roleOf(u)));
    return b ? { value: b.unit, reason: b.reason } : { value: "", reason: tr("No rock stands out as cutting the others: choose the one to build as a body.") };
  },
  choices: unitsByHoles,
  check: (ctx, value) => (!value ? tr("Choose a rock first.")
    : BODY_ROLES.has(ctx.roleOf(value)) ? null : tr("GeoStrix reads {code} as a layered rock, so it would draw its top, not a body. Mark it as an intrusion in 3D Modelling > Modelling codes, then build again.", { code: value })),
  contacts: (ctx, value) => ctx.intercepts().filter((c) => String(c.unit) === value),
  notes: () => [],
  run: (api, value, ctx) => api.runImplicitModel(ctx.target(value)), // mcode:<code> when Modelling codes give it its role (live: RSO marked overburden)
  prefill: (api, value, ctx) => api.setImplicitTarget(ctx.target(value)),
};

// TASKS.csv #3908 step 4 — the base of the cover or weathered zone: the implicit run on a code whose role is overburden draws its BASE
// (#1684). A code read as rock would give its top, the wrong surface, so the tool stops and says where to mark it as cover.
// The contacts: where the cover ends, down each hole (the top of whatever lies under its last interval).
function coverBases(ctx, code) {
  const ends = new Map();
  for (const r of ctx.rows) if (String(r.value) === code) ends.set(r.hole_id, Math.max(ends.get(r.hole_id) ?? -Infinity, Number(r.to)));
  return ctx.intercepts().filter((c) => ends.has(c.hole_id) && Math.abs(Number(c.from) - ends.get(c.hole_id)) < 0.01);
}
export const COVER = {
  id: "cover",
  title: "Cover and weathering",
  line: "The loose or weathered blanket under the ground surface.",
  sentence: "Builds the base of the cover or weathered zone: where it ends, down each hole, as one surface under the ground.",
  question: "Which code is the cover?",
  multi: false,
  help: "implicit-surface",
  expertPane: "implicit",
  feed: noLogs,
  suggest(ctx) {
    const c = suggestCover(ctx.rows, ctx.describe);
    return c ? { value: c.unit, reason: c.reason } : { value: "", reason: tr("No code starts most of the holes: choose the one logged as cover.") };
  },
  choices: unitsByHoles,
  check: (ctx, value) => (!value ? tr("Choose a code first.")
    : ctx.isCover(value) ? null : tr("GeoStrix reads {code} as a rock, so it would draw its top, not its base. Mark it as overburden in 3D Modelling > Modelling codes, then build again.", { code: value })),
  contacts: coverBases,
  notes: (ctx) => (ctx.hasTerrain ? [] : [tr("No terrain in the project: the ground is taken from the collar heights.")]),
  run: (api, value, ctx) => api.runImplicitModel(ctx.target(value)), // mcode:<code> when Modelling codes give it its role (live: RSO marked overburden)
  prefill: (api, value, ctx) => api.setImplicitTarget(ctx.target(value)),
};

// TASKS.csv #3909 (batch P7b) — thin sheets with a thickness: the Vein / dyke run on a Veins log value, or on a lithology code the run reads as a
// vein or dyke ("litho:<code>", #2226). It has its own reach and thickness rules, so the automatic part here is the plain check that enough holes
// cut the sheet, and the reason says which.
const holesWith = (rows, test) => new Set(rows.filter(test).map((r) => r.hole_id)).size;
// per choice: the holes that cut it and its intervals per hole. Many per hole is a vein SET or stockwork, not one sheet (the Vein run refuses it,
// found live on WA lode gold: QTZ, about 17 per hole), so those are offered last and stopped with a plain verdict
export const SET_PER_HOLE = 3;
function veinChoices(ctx) {
  const out = new Map();
  const add = (k, h) => { const e = out.get(k) || { holes: new Set(), rows: 0 }; e.holes.add(h); e.rows++; out.set(k, e); };
  for (const r of ctx.veins) if (r.value != null && r.value !== "") add(String(r.value), r.hole_id);
  for (const r of ctx.rows) { const v = String(r.value); if (BODY_ROLES.has(ctx.roleOf(v)) && ctx.roleOf(v) !== "breccia") add(`litho:${v}`, r.hole_id); }
  return [...out].map(([k, e]) => ({ key: k, holes: e.holes.size, perHole: e.rows / e.holes.size }))
    .sort((a, b) => (a.perHole > SET_PER_HOLE) - (b.perHole > SET_PER_HOLE) || b.holes - a.holes);
}
const veinLabel = (k) => (k.startsWith("litho:") ? k.slice(6) : k);
export const VEINS = {
  id: "veins",
  title: "Veins and dykes",
  line: "Thin sheets, from where the holes cut them.",
  sentence: "Builds a thin sheet with a thickness through the places where the holes cut a vein or dyke.",
  question: "Which vein or dyke?",
  multi: false,
  help: "vein-dyke",
  expertPane: "vein",
  feed: (ctx) => (veinChoices(ctx).length ? null : tr("No veins or dykes logged: a Veins log, or a lithology code read as a vein or dyke, is needed.")),
  suggest(ctx) {
    const c = veinChoices(ctx)[0];
    return { value: c.key, reason: tr("{v} is cut in {n} holes, more than any other vein or dyke logged.", { v: veinLabel(c.key), n: c.holes }) };
  },
  choices: (ctx) => veinChoices(ctx).map((c) => c.key),
  label: veinLabel,
  check: (ctx, value) => (value ? null : tr("Choose a vein or dyke first.")),
  auto(ctx, value) {
    const v = veinLabel(value), n = value.startsWith("litho:") ? holesWith(ctx.rows, (r) => String(r.value) === v) : holesWith(ctx.veins, (r) => String(r.value) === v);
    const c = veinChoices(ctx).find((x) => x.key === value);
    if (c && c.perHole > SET_PER_HOLE) return { ok: false, values: null, reasons: [], notes: [], verdict: [tr("{v} is logged about {k} times down each hole: a set of veins, not one sheet. Split it into single veins in Modelling codes, or show where the set is with an Alteration halo (All tools).", { v, k: fmtNum(Math.round(c.perHole)) })] };
    return n < 3
      ? { ok: false, values: null, reasons: [], notes: [], verdict: [tr("Only {n} holes cut {v}: a sheet needs three or more.", { n, v })] }
      : { ok: true, values: {}, reasons: [{ field: "holes", text: tr("{v} is cut in {n} holes: the sheet is drawn through those intercepts, with the thickness logged there.", { v, n }) }], notes: [], verdict: null };
  },
  prepare: () => {},
  ready: () => true,
  contacts: () => [],
  notes: () => [],
  run: (api, value) => api.runVeinModel(value),
  prefill: (api, value) => api.setVeinTarget(value),
};

// TASKS.csv #3909 — a fault from the measured picks: the Structural modelling run on one structure type of the structure log (picks with a
// dip and a dip direction). Suggested: the type named like a fault, with the most picks. Stopping the model at the fault (two fault blocks) is
// the full pane's choice, so the card says where it is.
const FAULT_WORDS = /\b(fault|flt|fz|shear|sz|brittle|gouge|crush)\w*/i;
function faultChoices(ctx) {
  const by = new Map();
  for (const s of ctx.structures) {
    const has = (v) => v != null && v !== "" && Number.isFinite(Number(v)); // Number(null) is 0: a pick with no dip is not a measurement
    if (s.value == null || s.value === "" || !has(s.dip) || !has(s.azimuth)) continue;
    const k = String(s.value), e = by.get(k) || { key: k, picks: 0, holes: new Set() };
    e.picks++; e.holes.add(s.hole_id); by.set(k, e);
  }
  return [...by.values()].sort((a, b) => FAULT_WORDS.test(b.key) - FAULT_WORDS.test(a.key) || b.picks - a.picks);
}
export const FAULTS = {
  id: "faults",
  title: "Faults",
  line: "A break that cuts and shifts the rocks.",
  sentence: "Builds a fault surface through your measured fault picks, from their positions, dips and directions.",
  question: "Which measurements are the fault?",
  multi: false,
  help: "structural-modelling",
  expertPane: "structural",
  feed: (ctx) => (faultChoices(ctx).length ? null : tr("No oriented structure measurements: a fault surface is built from picks with a dip and a dip direction.")),
  suggest(ctx) {
    const c = faultChoices(ctx)[0];
    return FAULT_WORDS.test(c.key)
      ? { value: c.key, reason: tr("{v} reads like a fault and has {n} measured picks in {h} holes.", { v: c.key, n: c.picks, h: c.holes.size }) }
      : { value: "", reason: tr("No structure type reads like a fault: choose the one that is.") };
  },
  choices: (ctx) => faultChoices(ctx).map((c) => c.key),
  check: (ctx, value) => (value ? null : tr("Choose the fault measurements first.")),
  // TASKS.csv #3919 — the engine's time for every pick, said before the run; when it is long, a quick first model (declustered picks) is offered
  // first and is the default. The model's resolution is autoSurface's quick one either way (lib/auto/autoFault.js).
  modeQuestion: "How quickly?",
  plan(ctx, value) {
    const key = `${value}|${ctx.structures.length}`;
    if (ctx.faultPlanKey !== key) { ctx.faultPlanKey = key; ctx.faultPlan = faultPlan({ collars: ctx.collars, picks: ctx.structures.filter((s) => String(s.value).toUpperCase() === String(value).toUpperCase()), rate: gempyRate().rate }); }
    return ctx.faultPlan;
  },
  modes(ctx, value) {
    const p = this.plan(ctx, value);
    if (!p.ok || !p.quick) return null;
    return [
      { key: "quick", label: tr("A quick first model: {k} of the {n} picks, spread through the holes, about {m} min", { k: p.quick.n, n: p.all.n, m: minutesOf(p.quick.seconds) }) },
      { key: "all", label: tr("Every pick: about {m} min", { m: minutesOf(p.all.seconds) }) },
    ];
  },
  auto(ctx, value, mode) {
    const c = faultChoices(ctx).find((x) => x.key === value);
    if (!c || c.picks < 3) return { ok: false, values: null, reasons: [], notes: [], verdict: [tr("Only {n} {v} picks with a dip and a direction: a fault surface needs three or more.", { n: c?.picks || 0, v: value })] };
    const p = this.plan(ctx, value);
    if (!p.ok) return { ok: false, values: null, reasons: [], notes: [], verdict: p.verdict };
    const quick = p.quick && mode !== "all";
    const reasons = [quick
      ? { field: "picks", text: tr("{k} of the {n} {v} picks, one per {b} m down each hole and at least one in each of its {h} holes: about {m} min instead of {all}.", { k: p.quick.n, n: c.picks, v: value, b: p.quick.binM, h: c.holes.size, m: minutesOf(p.quick.seconds), all: minutesOf(p.all.seconds) }) }
      : { field: "picks", text: tr("{n} {v} picks in {h} holes, with their dips and directions: the surface is fitted through them.", { n: c.picks, v: value, h: c.holes.size }) }];
    const notes = quick ? [tr("A quick first model. Refine it under Change these, with every pick and a finer resolution, in a longer run.")] : [];
    return { ok: true, values: { resolution: p.resolution, rows: quick ? p.quick.rows : null }, reasons, notes, verdict: null };
  },
  contacts: () => [],
  notes: () => [tr("To make the other models stop at this fault, open Change these: the Structural modelling pane sets which models it cuts.")],
  run: (api, value, ctx, values) => api.runStructuralModel(value, values?.rows ? { rows: values.rows } : undefined),
  prefill: (api, value) => api.setStructuralTarget(value),
};

// TASKS.csv #3909 — a grade model: the grade shell at a cut-off read from the grades (lib/auto/autoGradeShell.js), its cells, search and holes per
// cell from the drilling (lib/auto/autoBlockModel.js), along the trend the trend helper set (#3910) when there is one. The card gives the volume
// above the cut-off and says it is not a resource estimate; tonnes and grade-tonnage stay in All tools (Matt's decision 9).
// Sample positions here are the collar's, down the hole as if vertical: they size nothing but the thinning; the run desurveys its own.
function gradeSamples(ctx, sym) {
  const at = new Map(ctx.collars.map((c) => [c.hole_id, c])), out = [];
  for (const a of ctx.assays || []) {
    const v = Number(a?.values?.[sym]), c = at.get(a?.hole_id);
    if (!Number.isFinite(v) || !c) continue;
    const mid = (Number(a.from) + Number(a.to)) / 2;
    out.push({ hole_id: a.hole_id, from: Number(a.from), to: Number(a.to), value: v, x: Number(c.x), y: Number(c.y), z: Number(c.z) - (Number.isFinite(mid) ? mid : 0) });
  }
  return out;
}
// shown as the shell names it: a precious metal stored in ppm reads g/t (#2218)
const elementUnit = (ctx, sym) => gradeUnitLabel(sym, ctx.assayElements.find((e) => e.symbol === sym)?.unit || "");
export const GRADE = {
  id: "grade",
  title: "Grade model",
  line: "Where the metal is, as a shell above a cut-off.",
  sentence: "Builds a shell around the grades above a cut-off read from your assays, with cells and a search sized from your drilling.",
  question: "Which metal?",
  multi: false,
  help: "grade-shell",
  expertPane: "shell",
  feed: (ctx) => (ctx.assayElements.length ? null : tr("No assays yet: import them (Add data) and this tool reads them.")),
  suggest(ctx) {
    let best = null;
    for (const e of ctx.assayElements) { const n = gradeSamples(ctx, e.symbol).filter((s) => s.value > 0).length; if (!best || n > best.n) best = { sym: e.symbol, n }; }
    return { value: best.sym, reason: tr("{el} has the most assays with a grade above zero ({n}).", { el: best.sym, n: best.n }) };
  },
  choices: (ctx) => ctx.assayElements.map((e) => e.symbol),
  check: (ctx, value) => (value ? null : tr("Choose a metal first.")),
  auto(ctx, sym) {
    const samples = gradeSamples(ctx, sym), unit = elementUnit(ctx, sym);
    const gs = autoGradeShell({ collars: ctx.collars, samples, unit });
    if (!gs.ok) return gs;
    const bm = autoBlockModel({ collars: ctx.collars, samples, hasDensity: ctx.hasDensity });
    if (!bm.ok) return bm;
    const { x, z } = bm.values.blockSize;
    const reasons = [...gs.reasons.filter((r) => r.field === "cutoff"), ...bm.reasons.filter((r) => r.field !== "bounds" && r.field !== "maxSamples")];
    const notes = [...gs.notes, ...bm.notes];
    if (ctx.gradeTrend) reasons.push({ field: "trend", text: tr("It follows the trend set with the trend helper.") });
    else notes.push(tr("No trend is set, so the shell grows the same way in every direction. If the grade runs one way, set a trend first."));
    // the grade shell's own settings, in the order api.numeric lists them: metal, cut-off, cell across, cell height, search radius, holes
    return { ok: true, values: { list: [sym, gs.values.cutoff, x, z, bm.values.searchRadius, bm.values.minHoles] }, reasons, notes, verdict: null };
  },
  prepare: (api, v) => v.list.forEach((x, i) => api.numeric.set[i](x)),
  ready: (api, v) => v.list.every((x, i) => String(api.numeric.now[i]) === String(x)),
  contacts: () => [],
  notes: () => [],
  result(made, ctx, api) {
    const out = [];
    for (const s of made) {
      // the shell's enclosed volume, as the run's own message computes it (lib/volumetrics.js), from its mesh
      const geo = api?.meshOf?.(s.id)?.geometry, vol = geo ? computeMeshVolume(geo).volumeM3 : Number(s.params?.volumeM3);
      if (vol > 0) out.push(tr("{name}: {v} m³ above the cut-off.", { name: s.name, v: fmtNum(Number(vol.toPrecision(3))) }));
      if (s.closure === "artificial") out.push(tr("Part of this shell is closed at the search radius, so its volume depends on that radius as well as on the grades."));
    }
    out.push(tr("This is a picture of where the grade is, not a resource estimate. Tonnes and grade-tonnage are in All tools."));
    return out;
  },
  actions: [{ label: "Set a trend", run: (api) => api.openPane("settings") }],
  run: (api) => api.runNumericModel(),
  prefill: () => {}, // Build or not, the grade shell pane holds what was chosen (set before the run)
};

// in the Start here card's order: what lies on top first
export const GUIDED_TOOLS = [COVER, ROCK_LAYERS, BODIES, VEINS, FAULTS, GRADE];
export const toolById = (id) => GUIDED_TOOLS.find((t) => t.id === id) || null;
export { unitsByHoles };

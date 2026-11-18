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
import { t as tr } from "../../../lib/i18n.js";

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
function veinChoices(ctx) {
  const out = new Map();
  for (const r of ctx.veins) if (r.value != null && r.value !== "") out.set(String(r.value), (out.get(String(r.value)) || new Set()).add(r.hole_id));
  for (const r of ctx.rows) { const v = String(r.value); if (BODY_ROLES.has(ctx.roleOf(v)) && ctx.roleOf(v) !== "breccia") out.set(`litho:${v}`, (out.get(`litho:${v}`) || new Set()).add(r.hole_id)); }
  return [...out].map(([k, h]) => ({ key: k, holes: h.size })).sort((a, b) => b.holes - a.holes);
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

// in the Start here card's order: what lies on top first
export const GUIDED_TOOLS = [COVER, ROCK_LAYERS, BODIES, VEINS];
export const toolById = (id) => GUIDED_TOOLS.find((t) => t.id === id) || null;
export { unitsByHoles };

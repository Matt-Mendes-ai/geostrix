// TASKS.csv #3908 (the #3901 redesign, batch P7a) — the guided tools: each is one sentence, one question answered from the data first, and
// a "Build it for me" that runs an existing engine (the stack and implicit runs of modellingRuns.js) with settings from src/lib/auto/.
// A tool is a plain object; GuidedTool.jsx draws every one the same way. English strings are tr() keys, translated where they are drawn.
//
// ctx: { rows (the lithology log rows), intercepts() (desurveyed tops of each logged interval, lib/viewer/boundaryIntercepts.js), collars,
//        hasTerrain, describe(code) }
// tool: { id, title, line, sentence, question, multi, help, expertPane,
//         feed(ctx) -> null | why it cannot (a sentence), suggest(ctx) -> { value, reason }, choices(ctx) -> [unit],
//         contacts(ctx, value) -> the contacts autoSurface sizes the model from, check(ctx, value) -> null | why it cannot,
//         notes(ctx, value) -> [sentence], run(api, value), prefill(api, value) }
import { stackOrder, suggestBody } from "../../../lib/auto/autoUnits.js";
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

// TASKS.csv #3908 step 3 — one rock as a closed shape: the implicit run on that unit (its role decides a body, a dyke or a breccia body)
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
    const b = suggestBody(ctx.rows);
    return b ? { value: b.unit, reason: b.reason } : { value: "", reason: tr("No rock stands out as cutting the others: choose the one to build as a body.") };
  },
  choices: unitsByHoles,
  check: (ctx, value) => (value ? null : tr("Choose a rock first.")),
  contacts: (ctx, value) => ctx.intercepts().filter((c) => String(c.unit) === value),
  notes: () => [tr("Its volume is in its row under Generated surfaces; tonnes need a density.")],
  run: (api, value) => api.runImplicitModel(value),
  prefill: (api, value) => api.setImplicitTarget(value),
};

export const GUIDED_TOOLS = [ROCK_LAYERS, BODIES];
export const toolById = (id) => GUIDED_TOOLS.find((t) => t.id === id) || null;
export { unitsByHoles };

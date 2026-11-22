// TASKS.csv #3932 (batch 2, Main 2026-11-21) — a guided tool's "Build it for me" without its card: what an AI app's modelling change tools run (lib/mcpActions.js, through the
// StrixViewer hook modules/viewer/useMcpModelActions.js). It is GuidedTool.jsx's own build, as a promise: the tool's check, its automatic settings, the settings put in place,
// the run once they have rendered, and the surfaces it made (the ones not there before) once the engine's busy flag has fallen. The engine's progress and Cancel are in the status
// bar, as for the card. Nothing is chosen here: every value and verdict is the tool's (guidedTools.js), so an AI app gets exactly the card's answers and refusals.
//   getApi(): the api GuidedTool is given (ViewerModule.jsx), read afresh each time: a setting takes a render to arrive; getCtx(): the tool's ctx, from the store as GuidedTool builds it
import { autoSurface, QUICK_RESOLUTION } from "../../../lib/auto/autoSurface.js";
import { roleForLithology } from "../../../lib/layers.js";
import { toolById, BODIES, COVER, GRADE, ROCK_LAYERS, BODY_ROLES, unitsByHoles } from "./guidedTools.js";

const fail = (error) => ({ ok: false, error });
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const SETTINGS_WAIT_MS = 5000, QUIET_MS = 1500, RUN_WAIT_MS = 9 * 60000;

// the tool's ctx, as GuidedTool.jsx builds it (a test holds the two to the same fields)
export function guidedCtx(store, computeIntercepts) {
  const rows = store.layers?.litho || [], mcodes = store.modellingCodes?.codes || [];
  let cache = null;
  return { rows, veins: store.layers?.vein || [], structures: store.layers?.structure || [], assays: store.assays || [], survey: store.survey || [], assayElements: store.assayElements || [], hasDensity: (store.layers?.sg || []).length > 0, gradeTrend: !!store.structuralTrends?.use?.gradeShell, collars: store.collars || [], hasTerrain: !!store.terrain,
    describe: () => "", target: (v) => (mcodes.some((c) => c.name === v) ? `mcode:${v}` : v), roleOf: (v) => mcodes.find((c) => c.name === v)?.role || roleForLithology(v), isCover: (v) => (mcodes.find((c) => c.name === v)?.role || roleForLithology(v)) === "overburden",
    intercepts: () => (cache ||= (computeIntercepts?.() || []).filter((c) => c.layerKey === "litho")) };
}

// which guided tool builds this rock, by its role (Modelling codes, else its name): a cover's base when it is overburden, a body when it is an intrusion, dyke, vein or breccia, else the layers of the rocks that
// lie in a steady order (Rock layers). -> a guided tool
export const toolForRock = (ctx, rock) => (ctx.isCover(rock) ? COVER : BODY_ROLES.has(ctx.roleOf(rock)) ? BODIES : ROCK_LAYERS);
export { toolById, GRADE, ROCK_LAYERS, unitsByHoles };

// -> { ok: true, built: [names], ids, reasons: [text], notes: [text] } | { ok: false, error }
// the run's own warnings, word for word (data support, closed at the search radius, extrapolation, one hole): the messages it added under the sidebar that say how far to trust it
const PROTECTIVE = /ARTIFICIALLY|data support|extrapolat|not a resource|NOT a statistical|one hole alone|Part of this shell|beyond the drilling|dilute/i;
const noticeText = (n) => (typeof n === "string" ? n : n?.message ?? n?.text ?? "");
export async function runGuided({ tool, value, mode, ctx, getApi, getNotices = () => [], sleep = realSleep, settingsWaitMs = SETTINGS_WAIT_MS, quietMs = QUIET_MS, runWaitMs = RUN_WAIT_MS }) {
  if (!tool) return fail("Unknown model tool.");
  const feed = tool.feed(ctx);
  if (feed) return fail(feed);
  const why = tool.check(ctx, value);
  if (why) return fail(why);
  const auto = tool.auto ? tool.auto(ctx, value, mode) : autoSurface({ collars: ctx.collars, contacts: tool.contacts(ctx, value), hasLogs: true, maxResolution: QUICK_RESOLUTION });
  if (!auto.ok) return fail((auto.verdict || []).join(" ") || "The data cannot support this yet.");
  const api0 = getApi();
  if (!api0) return fail("StrixViewer is not ready.");
  if (api0.busy) return fail("Another model is running in GeoStrix: one at a time. Try again when it has finished.");
  const before = new Set((api0.surfaces || []).map((s) => s.id)), noticesBefore = new Set(getNotices() || []);
  try { (tool.prepare || ((a, v) => a.setModelResolution(v.resolution)))(api0, auto.values); } catch { return fail("The model's settings could not be put in place."); }
  const ready = tool.ready || ((a, v) => a.modelResolution === v.resolution);
  for (let waited = 0; !ready(getApi(), auto.values); waited += 30) { if (waited >= settingsWaitMs) return fail("GeoStrix did not apply the model's settings. Try again."); await sleep(30); }
  const api = getApi();
  let sawBusy = false, returned = false, quiet = 0;
  let started; try { started = Promise.resolve(tool.run(api, value, ctx, auto.values)); } catch { return fail("The model could not be started."); }
  const run = started.then(() => { returned = true; }, () => { returned = true; });
  // a run is finished when the busy flag it raised falls; one that never raised it (it stopped with a message) a moment after it returned (GuidedTool's rule)
  for (let waited = 0; ; waited += 50) {
    const busy = !!getApi()?.busy;
    if (busy) { sawBusy = true; quiet = 0; } else if (returned) { quiet += 50; if (sawBusy || quiet >= quietMs) break; }
    if (waited >= runWaitMs) return fail("The model is still running in GeoStrix; check its progress in the status bar.");
    await sleep(50);
  }
  await run;
  const made = (getApi()?.surfaces || []).filter((s) => !before.has(s.id));
  if (!made.length) return fail("Nothing was built: it was cancelled, or the run stopped with a message (the messages under the sidebar say why).");
  const reasons = (auto.reasons || []).map((x) => x.text).filter(Boolean);
  const notes = [...(tool.result ? tool.result(made, ctx, getApi()) : []), ...(auto.notes || []), ...tool.notes(ctx, value)].filter(Boolean);
  const messages = (getNotices() || []).filter((n) => !noticesBefore.has(n)).map(noticeText).filter((t) => PROTECTIVE.test(t)).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 900)).slice(0, 5);
  return { ok: true, built: made.map((s) => s.name), ids: made.map((s) => s.id), made, reasons, notes, messages };
}

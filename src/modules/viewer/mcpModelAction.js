// TASKS.csv #3932 (batch 2, Main 2026-11-21) — an AI app's modelling change tools (build_surface, build_grade_shell; lib/mcpActions.js, only while 'Allow AI apps to make
// changes' is on) carried out in StrixViewer: the guided tools' own "Build it for me" (guided/guidedRun.js), with the same checks, settings and refusals as their cards. ViewerModule
// passes a getter (`ctx()`, read afresh: a setting takes a render to arrive) and only its 3D View instance answers (the guided tools live there). Each answer carries `revert`,
// which takes out exactly the surfaces the run added (generated surfaces are not in GeoStrix's undo history: the toast's Undo is what takes them back). The engine's own progress and Cancel
// are in the status bar while it runs. guidedRun is loaded on first use (nothing here is in the startup chunk).
import { requestModuleAction } from "../../lib/menuRequests.js";

const lower = (v) => String(v ?? "").trim().toLowerCase();
const fail = (error) => ({ ok: false, error });
const line = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
const lines = (xs, n) => (xs || []).map(line).filter(Boolean).slice(0, n);

// c(): { store: { layers, modellingCodes, assays, survey, assayElements, structuralTrends, collars, terrain }, api (GuidedTool's), removeSurfaces(ids), lastLithBlock,
// addLithBlockModel, addVoxelModel, removeVoxelModel, isSameProject }
// p: { op: 'fault', name?, evidence?, extent?, ... } (#4053, batch 4) | { op: 'surface', rock } | { op: 'grade_shell', element } | { op: 'block_model' } | #3932 batch 3: { op: 'shell_blocks' } | { op: 'vein', code } | { op: 'alteration', code }
// TASKS.csv #4053 — model_from_map: the pane is opened and its own hook (components/useMcpMapModel.js) does the rest; the request waits for the pane's lazy chunk, and one the pane never
// answered in time is cancelled (expired) so it cannot start a run after the call was refused
function viaMapPane(now, p) {
  return new Promise((resolve) => {
    let started = false, expired = false;
    const timer = setTimeout(() => { if (!started) { expired = true; resolve(fail("Model from map did not open in GeoStrix. Try again.")); } }, 30000);
    const env = { getSurfaces: () => now().api?.surfaces || [], getRasters: () => now().store?.rasters || [], getNotices: () => now().notices || [], started: () => { started = true; clearTimeout(timer); }, expired: () => expired, removeSurfaces: () => now().removeSurfaces };
    try { now().api?.openPane?.("mapmodel", true); } catch { /* no viewer */ }
    requestModuleAction("mcp-map-model", { map: p.map, order_from: p.order_from, relation: p.relation, faults: p.faults, env, reply: (r) => resolve(r) });
  });
}

export async function modelAction(c, p, load = () => import("./guided/guidedRun.js")) {
  if (!p || typeof p !== "object") return fail("Nothing asked.");
  if (p.op === "map_model") return viaMapPane(c, p); // TASKS.csv #4053 — the Model from map pane, driven as a person would
  if (p.op === "fault") return (await import("./mcpFaultRun.js")).faultAction(c(), p); // TASKS.csv #4053 — the Faults pane's own build, no guided card
  const G = await load();
  const now = () => c();
  const ctx = p.op === "block_model" || p.op === "shell_blocks" ? null : G.guidedCtx(now().store, () => now().api?.computeIntercepts?.()); // the blocks are the last model's: no tool's ctx
  const getApi = () => now().api;
  let tool, value, changed, said, rockName;
  if (p.op === "surface") {
    const choices = G.unitsByHoles(ctx);
    const rock = choices.find((u) => lower(u) === lower(p.rock));
    if (!rock) return fail(`No rock '${line(p.rock).slice(0, 64)}' in the lithology log. The rocks logged: ${choices.slice(0, 40).join(", ") || "none"}.`);
    tool = G.toolForRock(ctx, rock); value = rock; rockName = rock; said = tool.id;
    changed = tool.id === "cover" ? "cover base surface" : tool.id === "layers" ? "rock layers" : "body surface";
    if (tool.id === "layers") { // a layered rock: the layers of the rocks that lie in a steady order down the holes, as the Rock layers card builds them (the card's own suggestion)
      const sug = tool.suggest(ctx).value || [];
      if (!sug.includes(rock)) return fail(`${rock} is not one of the rocks that lie in a steady order, top to bottom, down the holes${sug.length ? ` (${sug.slice(0, 12).join(", ")})` : ""}. Mark it as an intrusion or as overburden in Modelling codes, or name one of those.`);
      value = tool.ordered ? tool.ordered(ctx, sug) : sug;
    }
  } else if (p.op === "grade_shell") {
    const els = ctx.assayElements.map((e) => e.symbol);
    const el = els.find((s) => lower(s) === lower(p.element));
    if (!el) return fail(`No element '${line(p.element).slice(0, 32)}' in this project's assays. Available: ${els.slice(0, 40).join(", ") || "none"}.`);
    tool = G.GRADE; value = el; changed = "grade shell"; said = "grade";
  } else if (p.op === "block_model") { // the Result block's 'Add as block model' on the last model's lithology blocks (nothing is built here: the blocks are the last model's)
    const c0 = now();
    // TASKS.csv #3932 batch 3 (Matt asked for the Zn grade shell as a block model and got only this refusal) — it names the routes that do give blocks
    if (!c0.lastLithBlock) return fail("No lithology blocks yet: this adds the last model's lithology blocks (built in GeoStrix from the surfaces, or a GemPy model). For a grade shell's cells use add_grade_shell_blocks; for grades estimated into blocks use build_grade_estimate; for rock blocks build the surfaces first (build_surface), then Build the blocks from surfaces in GeoStrix.");
    const r = await c0.addLithBlockModel();
    if (!r?.ok) return fail(line(r?.error || "The blocks could not be added.").slice(0, 400));
    const id = r.id;
    return { ok: true, changed: "block model", name: line(r.name).slice(0, 120), id, cells: r.cells, units: r.units, notes: lines(r.notes, 4), revert: () => { try { now().removeVoxelModel?.(id); } catch { /* already gone */ } } };
  } else if (p.op === "shell_blocks") { // TASKS.csv #3932 batch 3 — the last grade shell's own cells (lib/lastShellCells.js, kept by the Grade shell run)
    const c0 = now(), L = await import("../../lib/lastShellCells.js");
    const r = L.shellBlockModel(L.lastShellCells(), { surfaces: c0.api?.surfaces || [], sameProject: (key) => !key || !c0.isSameProject || c0.isSameProject({ key }) });
    if (!r.ok) return r;
    const id = c0.addVoxelModel(r.model);
    return { ok: true, changed: "block model", name: line(r.model.name).slice(0, 120), id, cells: r.cells, element: r.model.params.element, unit: r.model.params.unit, cutoff: r.model.params.cutoff,
      value: r.model.params.value, ...(r.grades ? {} : { note: "For grades in blocks use build_grade_estimate (it keeps to the closed shell)." }), not_a_resource_estimate: r.model.params.note,
      revert: () => { try { now().removeVoxelModel?.(id); } catch { /* already gone */ } } };
  } else if (p.op === "vein") { // TASKS.csv #3932 batch 3 — the Veins and dykes card: a code of the Veins log, or a lithology code read as a vein or dyke
    const keys = G.VEINS.choices(ctx), want = lower(p.code);
    const key = keys.find((k) => lower(k) === want) || keys.find((k) => k.startsWith("litho:") && lower(k.slice(6)) === want);
    if (!key) { const feed = G.VEINS.feed(ctx); return fail(feed || `No vein or dyke '${line(p.code).slice(0, 64)}' logged. The veins and dykes logged: ${keys.slice(0, 40).map((k) => G.VEINS.label(k)).join(", ")}.`); }
    tool = G.VEINS; value = key; changed = "vein surface"; said = "veins"; rockName = G.VEINS.label(key);
  } else if (p.op === "alteration") { // TASKS.csv #3932 batch 3 — the Alteration halo card: a code of the Alteration log
    const codes = G.ALTERATION.choices(ctx), code = codes.find((k) => lower(k) === lower(p.code));
    if (!code) { const feed = G.ALTERATION.feed(ctx); return fail(feed || `No alteration '${line(p.code).slice(0, 64)}' logged. The alteration codes logged: ${codes.slice(0, 40).join(", ")}.`); }
    tool = G.ALTERATION; value = code; changed = "alteration halo"; said = "alteration"; rockName = code;
  } else return fail("Unknown model request.");
  const r = await G.runGuided({ tool, value, ctx, getApi, getNotices: () => now().notices });
  if (!r.ok) return fail(line(r.error).slice(0, 400));
  const ids = r.ids;
  return { ok: true, changed, ...(p.op === "vein" || p.op === "alteration" ? { code: rockName } : { rock: rockName }), element: p.op === "grade_shell" ? value : undefined, built: r.built.map((n) => line(n).slice(0, 80)).slice(0, 12), ids, tool: said,
    why: lines(r.reasons, 4), notes: lines(r.notes, 4), ...(r.messages?.length ? { warnings: r.messages } : {}), /* the run's own warnings (data support, extrapolation, ...) word for word */ revert: (st) => { try { (st?.removeSurfaces || now().removeSurfaces)?.(ids); } catch { /* already gone */ } } };
}

// TASKS.csv #3932 (Matt's decision, 2026-11-21) — the change tools an AI app may call through AI App Access, when the user has ticked 'Allow AI apps to make changes'
// (the main process refuses them otherwise, electron/mcpProtocol.js, before they get here). Loaded on the first change, like mcpTools.js.
//  - Store actions only: an action calls the same store functions the buttons call, and never window.desktop (no file, dialog, database or sidecar is reachable).
//  - Nothing deletes or overwrites: an action only adds (a section, an intercept set, a Layout page, a raster) or changes what is shown; one that would replace
//    something refuses and says why.
//  - One action, one step: undoCheckpoint() before (the user's own last edit is its own step) and after (labelled with what the AI app did, for the Undo
//    button's tooltip). What is in the undo history (sections, intercept sets, Layout pages since #3935) is taken back by Ctrl+Z; what never was (the view: hole colours,
//    layers shown, the camera; rasters, the terrain, generated surfaces and shells) by the toast's Undo, which reverts exactly that change and nothing else.
//  - Every change shows: a toast says what was done, with Undo, and stays until dismissed; the AI App Access window lists the change with the same Undo
//    (lib/mcpChangeLog.js), so it is not lost with the toast; the answer to the app is short ({ ok, changed, name, id }).
import { t as tr } from "./i18n.js";
import { landed } from "./projectJobs.js"; // TASKS.csv #3953 — an AI app's change belongs to the project it was asked in
import { requestModuleAction } from "./menuRequests.js";
import { holeTraces } from "./evidenceSources.js";
import { sectionThroughHole } from "./sectionDefs.js";
import { interceptTablePlan, columnFormat } from "./interceptTable.js";
import { pagePx, pageFormatOf, addPagesOnPaper } from "./pageFormats.js";
import { recordChange } from "./mcpChangeLog.js";

const SETTLE_MS = 60; // the store's undo bookkeeping runs after React has rendered the change
export const settleRender = () => new Promise((r) => setTimeout(r, SETTLE_MS));
const MODULE_WAIT_MS = 20000;
const FETCH_WAIT_MS = 9 * 60000; // a download (the host gives a network tool 10 minutes)
const MODEL_WAIT_MS = 9 * 60000; // a model run (the host gives a long tool 10 minutes, #3932 batch 2)
const norm360 = (a) => ((a % 360) + 360) % 360;
const r1 = (v) => Math.round(v * 10) / 10;
const short = (v, n) => String(v ?? "").slice(0, n);
const fail = (error) => ({ ok: false, error });
// a name not already used by one of `taken` (names): 'A-A', then 'A-A (2)' ... (nothing is overwritten)
export function freeName(want, taken) {
  const used = new Set((taken || []).map((x) => String(x).toLowerCase()));
  if (!used.has(want.toLowerCase())) return want;
  for (let i = 2; i < 1000; i++) { const n = `${want} (${i})`; if (!used.has(n.toLowerCase())) return n; }
  return `${want} (${Date.now()})`;
}
const holeById = (s, id) => { const k = String(id).toLowerCase(); return (s.collars || []).find((c) => String(c.hole_id).toLowerCase() === k) || null; };
// a tool that lives in a module (Layout's one-click sheets, ...): the tab comes forward and the module's own handler (useModuleAction) answers through `reply`
export function viaModule(s, tab, action, payload, waitMs = MODULE_WAIT_MS) {
  try { s.goToModule?.(tab); } catch { /* no tabs */ }
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(fail("GeoStrix did not answer in time. Try again.")); } }, waitMs);
    requestModuleAction(action, { ...payload, reply: (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r && typeof r === "object" ? r : fail("The change could not be made.")); } });
  });
}

// name -> async (args, store, ctx) => { ok, data: { changed, name?, id? }, say (translated, for the toast), tracked (in the undo history), revert(store) } | { ok: false, error }
export const ACTIONS = {
  // TASKS.csv #3962 (P5) — the drill planner's changes (lib/drillPlanner/mcpPlanner.js, loaded on use): a suggested program (long), its holes
  // added as proposed planned holes, a planned hole's status. All in the undo history (tracked: the project and the planned holes).
  async run_drill_planner(a, s, ctx) { return (await import("./drillPlanner/mcpPlanner.js")).run_drill_planner(a, s, ctx); },
  async add_program_holes(a, s) { return (await import("./drillPlanner/mcpPlanner.js")).add_program_holes(a, s); },
  async set_planned_hole_status(a, s) { return (await import("./drillPlanner/mcpPlanner.js")).set_planned_hole_status(a, s); },
  // TASKS.csv #4093 (batch 5, piece A) — saves one of suggest_thresholds' rules as an element's anomaly threshold (the Thresholds pane's own record); refuses to replace a saved one
  async set_threshold(a, s) { return (await import("./mcpGeo.js")).setThreshold(a, s); },
  // a new section: two points in the project's coordinates, or through a hole in its own plane (as the hole's 'Section through' does); never replaces one
  async make_section(a, s) {
    const hasPts = a.from !== undefined || a.to !== undefined;
    if (hasPts && a.along_hole !== undefined) return fail("Give either 'from' and 'to' or 'along_hole', not both.");
    let g, base;
    if (a.along_hole !== undefined) {
      const c = holeById(s, a.along_hole);
      if (!c) return fail(`No hole '${short(a.along_hole, 64)}' in this project. list_holes shows the ids.`);
      const t = holeTraces(s.collars, s.survey, s.desurveyMethod).get(c.hole_id);
      g = t && sectionThroughHole(t.map((p) => p.x), t.map((p) => p.y), { fallbackAzimuth: 0 });
      if (!g) return fail(`${c.hole_id} has no desurveyed trace to cut a section through.`);
      base = `Section through ${c.hole_id} (az ${g.azimuth.toFixed(0)}°)`; // project text: English, as the hole's own 'Section through'
    } else {
      if (!a.from || !a.to) return fail("Give 'from' and 'to' (each { x, y } in the project's coordinates), or 'along_hole'.");
      const len = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
      if (!(len >= 1)) return fail("'from' and 'to' must be at least 1 m apart.");
      if (len > 200000) return fail("The section would be over 200 km long: check the coordinates are the project's (list_holes gives the collars').");
      g = { ax: a.from.x, ay: a.from.y, bx: a.to.x, by: a.to.y, azimuth: norm360((Math.atan2(a.to.x - a.from.x, a.to.y - a.from.y) * 180) / Math.PI) };
      base = `Section ${Math.round((g.ax + g.bx) / 2)}E ${Math.round((g.ay + g.by) / 2)}N az ${g.azimuth.toFixed(0)}°`;
    }
    const name = freeName(a.name ? String(a.name).trim() || base : base, (s.sections || []).map((x) => x.name));
    const id = `sect_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const corridor = Number.isFinite(a.corridor_m) ? a.corridor_m : 100; // the 3D View's default buffer
    s.upsertSection({ id, name, ax: g.ax, ay: g.ay, bx: g.bx, by: g.by, azimuth: g.azimuth, corridor, contacts: [] });
    s.goToModule?.("viewer");
    return { ok: true, tracked: true, data: { changed: "section", name, id, azimuth: r1(g.azimuth), length_m: r1(Math.hypot(g.bx - g.ax, g.by - g.ay)), corridor_m: corridor },
      say: tr("added section '{name}'", { name }), revert: (st) => { if ((st?.sections || []).some((x) => x.id === id)) st.deleteSection(id); } };
  },
  // a Layout one-click sheet (#3912) as a new page, through Layout's own makeSheet
  async make_sheet(a, s) {
    const r = await viaModule(s, "layout", "mcp-make-sheet", { kind: a.kind });
    if (!r.ok) return r;
    const ids = r.ids || [];
    return { ok: true, tracked: true, data: { changed: "layout page", name: r.name, id: ids[0] || null }, // tracked: adding a page is an undo step since #3935 (it used to clear the history), so Ctrl+Z takes it back
      say: tr("added the Layout page '{name}'", { name: r.name }), revert: (st) => { const have = new Set((st?.layoutPages || []).map((p) => p.id)); const gone = ids.filter((x) => have.has(x)); if (gone.length) st.deleteLayoutPage(gone); } };
  },
  // Best intercepts (as the read tool best_intercepts computes them: the lab assays without the QC samples, uncut) as a table on a NEW Layout page, best first
  async add_best_intercepts(a, s) {
    const { runTool } = await import("./mcpTools.js");
    const r = runTool("best_intercepts", { element: a.element, cutoff: a.cutoff, ...(a.min_length !== undefined ? { min_length: a.min_length } : {}), ...(a.max_internal_dilution !== undefined ? { max_internal_dilution: a.max_internal_dilution } : {}), limit: 200 }, s);
    if (!r.ok) return r;
    const d = r.data, rows = d.rows || [];
    if (!rows.length) return fail(`No intercept of ${d.element} at ${d.cutoff} ${d.unit}: nothing to put on a page.`);
    const fmt = pageFormatOf((s.layoutPages || []).find((pg) => pg.id === s.activeLayoutPageId)), page = pagePx(fmt), w = Math.min(page.w - 80, 560);
    const plan = interceptTablePlan([], { ...page, h: page.h - 40 /* the data credit's line */ }, { total: d.total, w });
    const shown = rows.slice(0, plan.shown), unit = d.unit || "";
    const fG = columnFormat(shown.map((x) => x.average_grade)), fGT = columnFormat(shown.map((x) => x.average_grade * x.length));
    const columns = [tr("Hole"), tr("From (m)"), tr("To (m)"), tr("Length (m, downhole)"), `${d.element} (${unit})`, tr("Grade × length ({unit} × m)", { unit })];
    const body = shown.map((x) => [String(x.hole_id), Number(x.from).toFixed(2), Number(x.to).toFixed(2), Number(x.length).toFixed(2), fG(x.average_grade), fGT(x.average_grade * x.length)]);
    const more = d.total - shown.length;
    const dil = Number.isFinite(a.max_internal_dilution) ? a.max_internal_dilution : 2, min = Number.isFinite(a.min_length) ? a.min_length : 0;
    const from = tr("{symbol} ≥ {cutoff} {unit}, dilution ≤ {dil} m, min {min} m", { symbol: d.element, cutoff: d.cutoff, unit, dil, min });
    const note = [tr("QC samples (standards, blanks, duplicates) are excluded."), tr("Grades are uncut: no top cut has been applied."), tr("Lengths are downhole, not true widths."), tr("Screening tool: verify any intercept against the raw assay certificates before reporting it.")].join(" ");
    const stamp = Date.now();
    const table = { id: `table_${stamp}`, type: "table", source: "static", align: columns.map((_, j) => (j === 0 ? "left" : "right")), x: plan.x, y: plan.y, w, fontPt: 7, frameWidth: 1,
      title: tr("Best intercepts: {from}", { from }), from, note, columns, rows: more > 0 ? [...body, [tr("… and {n} more intercept(s), not shown on this sheet", { n: more }), ...columns.slice(1).map(() => "")]] : body };
    const ids = addPagesOnPaper(s.addLayoutPages, s.setLayoutPageFormat, [{ name: tr("Best intercepts"), elements: [table] }], fmt);
    s.goToModule?.("layout");
    return { ok: true, tracked: true, data: { changed: "layout page", name: tr("Best intercepts"), id: ids[0] || null, intercepts: d.total, on_the_page: shown.length }, // tracked: see make_sheet
      say: tr("added a Best intercepts page ({n} intercepts of {symbol})", { n: d.total, symbol: d.element }), revert: (st) => { const have = new Set((st?.layoutPages || []).map((p) => p.id)); const gone = ids.filter((x) => have.has(x)); if (gone.length) st.deleteLayoutPage(gone); } };
  },
  // the view tools: StrixViewer's own setters and camera (modules/viewer/useMcpViewActions.js); the view is not in the undo history, so the toast's Undo puts it back
  async colour_holes(a, s) {
    const r = await viaModule(s, "viewer", "mcp-view", { op: "colour", by: a.by, name: a.name });
    if (!r.ok) return r;
    const say = a.by === "none" ? tr("drew the holes in one colour") : a.by === "field" ? tr("coloured the holes by {field}", { field: r.name }) : a.by === "element" ? tr("showed the {symbol} grades along the holes", { symbol: r.name }) : tr("showed the {layer} log", { layer: r.name });
    return { ok: true, tracked: false, data: { changed: r.changed, name: r.name }, say, revert: r.revert };
  },
  async show_layers(a, s) {
    const r = await viaModule(s, "viewer", "mcp-view", { op: "layers", layers: a.layers, visible: a.visible });
    if (!r.ok) return r;
    return { ok: true, tracked: false, data: { changed: "layers shown", layers: r.layers, visible: r.visible, ...(r.not_found ? { not_found: r.not_found } : {}) },
      say: a.visible ? tr("showed {layers}", { layers: r.name }) : tr("hid {layers}", { layers: r.name }), revert: r.revert };
  },
  async set_view(a, s) {
    if ((a.view === "hole" || a.view === "section") && !a.target) return fail(`'target' is needed with view: '${a.view}' (a ${a.view === "hole" ? "hole id" : "section name"}).`);
    const r = await viaModule(s, "viewer", "mcp-view", { op: "view", view: a.view, target: a.target });
    if (!r.ok) return r;
    const say = a.view === "section" ? tr("opened the section '{name}'", { name: r.name }) : a.view === "hole" ? tr("zoomed to {hole}", { hole: r.name }) : a.view === "fit" ? tr("fitted the view to the data") : a.view === "top" ? tr("turned the view to the top") : tr("turned the view to the bottom");
    return { ok: true, tracked: false, data: { changed: r.changed, name: r.name }, say, ...(r.revert ? { revert: r.revert } : {}) };
  },
  // the network tools: the download was asked for in GeoStrix's main process (a native box, every time) before the call reached this window. Each runs the pane's own fetch
  // (Maps › Satellite image / Terrain) with its checks, and answers when it has finished.
  async fetch_satellite_image(a, s) {
    const r = await viaModule(s, "maps", "mcp-fetch-satellite", { ...(Number.isFinite(a.max_cloud_percent) ? { maxCloud: a.max_cloud_percent } : {}), ...(a.area ? { area: a.area } : {}) }, FETCH_WAIT_MS);
    if (!r.ok) return r;
    const ids = r.ids || [];
    return { ok: true, tracked: false, data: { changed: "raster", name: r.name, id: ids[0] || null, pictures: r.pictures ?? ids.length, over: r.over, area_cloud_percent: r.area_cloud_percent ?? null },
      say: tr("added the satellite image '{name}'", { name: r.name }), revert: (st) => { for (const id of ids) if ((st?.rasters || []).some((x) => x.id === id)) st.removeRaster(id); } };
  },
  async fetch_terrain(_a, s) {
    if (s.terrain) return fail("A terrain is already loaded: remove it in GeoStrix first."); // nothing is overwritten
    const r = await viaModule(s, "maps", "mcp-fetch-terrain", {}, FETCH_WAIT_MS);
    if (!r.ok) return r;
    const { ok, name, id, ...rest } = r;
    return { ok: true, tracked: false, data: { changed: "terrain", name, id: id || null, ...rest },
      say: tr("added the terrain '{name}'", { name }), revert: (st) => { if (st?.terrain && (!id || st.terrain.id === id)) st.removeTerrain(); } };
  },
  // TASKS.csv #3932 batch 2 — the modelling tools: a guided tool's own "Build it for me" (StrixViewer, modules/viewer/guided/guidedRun.js), with its checks, its settings read
  // from the logs and its refusals; one model at a time; the engine's progress and Cancel are in the status bar. They only add a surface (nothing is replaced); generated surfaces
  // are not in the undo history, so the toast's Undo takes out exactly what was added.
  async build_surface(a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "surface", rock: a.rock }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("built the surface '{name}'", { name: (r.built || [])[0] || a.rock }), revert };
  },
  // the last model's lithology blocks, added as a block model (the Result block's own 'Add as block model'); the blocks are the last model's: nothing is built here
  async add_block_model(_a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "block_model" }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("added the model's blocks as the block model '{name}'", { name: r.name }), revert };
  },
  async build_grade_shell(a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "grade_shell", element: a.element }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("built the {symbol} grade shell", { symbol: r.element || a.element }), revert };
  },
  // TASKS.csv #3932 batch 3 (Matt, 2026-11-22: "start batch 3") — grades into blocks, a shell's cells as blocks, a vein, an alteration halo. Block models and
  // generated surfaces are not in the undo history: the toast's Undo takes out exactly what was added.
  // Grade estimation, run in its own dialog (components/useMcpEstimate.js): its defaults from the data, Run, Add to project; long, so 'started' + job_status
  async build_grade_estimate(a, s) {
    const r = await viaModule(s, "viewer", "mcp-estimate-open", { element: a.element }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("estimated {symbol} into the block model '{name}'", { symbol: r.element || a.element, name: r.name }), revert };
  },
  // the last grade shell's own cells as a block model (lib/lastShellCells.js)
  async add_grade_shell_blocks(_a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "shell_blocks" }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("added the grade shell's cells as the block model '{name}'", { name: r.name }), revert };
  },
  // TASKS.csv #4053 (batch 4) — the Faults pane's own build (sheeted planes, modules/viewer/mcpFaultRun.js): from the logged fault picks / intervals, with the pane's verdicts; instant (no solver)
  async build_fault(a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "fault", name: a.name, evidence: a.evidence, extent: a.extent, margin_m: a.margin_m, sheet_gap_m: a.sheet_gap_m, dip: a.dip, dip_direction: a.dip_direction }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    const n = (r.built || []).length;
    return { ok: true, tracked: false, data: rest, say: n > 1 ? tr("built the fault '{name}' as {n} sheets", { name: r.name, n }) : tr("built the fault '{name}'", { name: r.name }), revert };
  },
  // Model from map (the pane's own run, components/useMcpMapModel.js): the map's age order by default, the relation, the faults the pane's Pick for me keeps; long ('started' + job_status), with the fit card's numbers
  async model_from_map(a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "map_model", map: a.map, order_from: a.order_from, relation: a.relation, faults: a.faults }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("built the model from the map '{name}'", { name: r.map || a.map || "" }), revert };
  },
  // the guided Veins and dykes card, and the Alteration halo (guided/guidedTools.js VEINS, ALTERATION), with their verdicts
  async build_vein(a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "vein", code: a.code }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("built the vein '{name}'", { name: (r.built || [])[0] || a.code }), revert };
  },
  async build_alteration(a, s) {
    const r = await viaModule(s, "viewer", "mcp-model", { op: "alteration", code: a.code }, MODEL_WAIT_MS);
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: tr("built the alteration halo '{name}'", { name: (r.built || [])[0] || a.code }), revert };
  },
};
export const CHANGE_TOOL_NAMES = () => Object.keys(ACTIONS);

export async function runChange(name, args, { getStore, client = "An AI app", toast = () => {}, settle = settleRender, actions = ACTIONS } = {}) {
  const act = typeof name === "string" && Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null;
  if (!act) return { ok: false, error: `Unknown change tool: ${String(name).slice(0, 40)}` };
  const s = getStore?.();
  if (!s) return { ok: false, error: "GeoStrix has no project open to change." };
  try { s.undoCheckpoint?.(); } catch { /* no history */ }
  // TASKS.csv #3953 — a change that takes a while (a satellite image, a terrain) finishes into the project it was asked in, or not at all
  const job = s.startProjectJob?.({ label: tr("{client}: {what}", { client, what: String(name) }) }) || null;
  let r;
  try { r = await act(args && typeof args === "object" ? args : {}, s, { getStore, client }); } catch { return { ok: false, error: "The change could not be made." }; } // a stack or a path never goes out
  if (!r?.ok) { job?.end(); return { ok: false, error: String(r?.error || "The change could not be made.").slice(0, 400) }; }
  if (job && !(await landed(job))) return { ok: false, error: "The project this change was asked in was closed before it finished; nothing was changed in another project." }; // #3953
  job?.end();
  await settle();
  const said = r.say ? tr("{client}: {what}", { client, what: r.say }) : "";
  try { getStore?.()?.undoCheckpoint?.(r.tracked && said ? said : undefined); } catch { /* no history */ }
  if (said) {
    const revert = typeof r.revert === "function" ? r.revert : null;
    // #3932 (Main) — the change is also listed in AI App Access with its own Undo; the toast's and the list's Undo are one (it runs once)
    // #3953 — its Undo acts on the project it changed only (shown again later it can still be undone; in another project it does nothing)
    const ownKey = job?.key || null;
    const entry = recordChange({ client, tool: name, message: said, revert: revert ? () => { const st = getStore?.(); if (ownKey && st?.isSameProject && !st.isSameProject({ key: ownKey })) return; try { st?.undoCheckpoint?.(); revert(st); } catch { /* already gone */ } } : null });
    try { toast({ ok: true, message: said, sticky: true, ...(revert ? { undo: () => entry.undo(), entry } : {}) }); } catch { /* no window */ }
  }
  return { ok: true, data: { ok: true, ...(r.data || {}) } };
}

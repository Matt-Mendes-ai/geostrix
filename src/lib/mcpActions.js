// TASKS.csv #3932 (Matt's decision, 2026-11-21) — the change tools an AI app may call through AI App Access, when the user has ticked 'Allow AI apps to make changes'
// (the main process refuses them otherwise, electron/mcpProtocol.js, before they get here). Loaded on the first change, like mcpTools.js.
//  - Store actions only: an action calls the same store functions the buttons call, and never window.desktop (no file, dialog, database or sidecar is reachable).
//  - Nothing deletes or overwrites: an action only adds (a section, an intercept set, a Layout page, a raster) or changes what is shown; one that would replace
//    something refuses and says why.
//  - One action, one step: undoCheckpoint() before (the user's own last edit is its own step) and after (labelled with what the AI app did, for the Undo
//    button's tooltip). What is in the undo history (sections, intercept sets, Layout pages) is taken back by Ctrl+Z; what never was (the view: hole colours,
//    layers shown, the camera; rasters and the terrain) by the toast's Undo, which reverts exactly that change and nothing else.
//  - Every change shows: a toast says what was done, with Undo; the AI App Access window lists the call; the answer to the app is short ({ ok, changed, name, id }).
import { t as tr } from "./i18n.js";
import { requestModuleAction } from "./menuRequests.js";
import { holeTraces } from "./evidenceSources.js";
import { sectionThroughHole } from "./sectionDefs.js";
import { interceptTablePlan, columnFormat } from "./interceptTable.js";
import { pagePx, pageFormatOf, addPagesOnPaper } from "./pageFormats.js";

const SETTLE_MS = 60; // the store's undo bookkeeping runs after React has rendered the change
export const settleRender = () => new Promise((r) => setTimeout(r, SETTLE_MS));
const MODULE_WAIT_MS = 20000;
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
    return { ok: true, tracked: false, data: { changed: "layout page", name: r.name, id: ids[0] || null },
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
    return { ok: true, tracked: false, data: { changed: "layout page", name: tr("Best intercepts"), id: ids[0] || null, intercepts: d.total, on_the_page: shown.length },
      say: tr("added a Best intercepts page ({n} intercepts of {symbol})", { n: d.total, symbol: d.element }), revert: (st) => { const have = new Set((st?.layoutPages || []).map((p) => p.id)); const gone = ids.filter((x) => have.has(x)); if (gone.length) st.deleteLayoutPage(gone); } };
  },
};
export const CHANGE_TOOL_NAMES = () => Object.keys(ACTIONS);

export async function runChange(name, args, { getStore, client = "An AI app", toast = () => {}, settle = settleRender, actions = ACTIONS } = {}) {
  const act = typeof name === "string" && Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null;
  if (!act) return { ok: false, error: `Unknown change tool: ${String(name).slice(0, 40)}` };
  const s = getStore?.();
  if (!s) return { ok: false, error: "GeoStrix has no project open to change." };
  try { s.undoCheckpoint?.(); } catch { /* no history */ }
  let r;
  try { r = await act(args && typeof args === "object" ? args : {}, s, { getStore, client }); } catch { return { ok: false, error: "The change could not be made." }; } // a stack or a path never goes out
  if (!r?.ok) return { ok: false, error: String(r?.error || "The change could not be made.").slice(0, 400) };
  await settle();
  const said = r.say ? tr("{client}: {what}", { client, what: r.say }) : "";
  try { getStore?.()?.undoCheckpoint?.(r.tracked && said ? said : undefined); } catch { /* no history */ }
  if (said) {
    const revert = typeof r.revert === "function" ? r.revert : null;
    try { toast({ ok: true, message: said, ...(revert ? { undo: () => { const st = getStore?.(); try { st?.undoCheckpoint?.(); revert(st); } catch { /* already gone */ } } } : {}) }); } catch { /* no window */ }
  }
  return { ok: true, data: { ok: true, ...(r.data || {}) } };
}

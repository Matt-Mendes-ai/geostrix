// TASKS.csv #4093 (AI app access batch 5, piece B; Matt, 2026-11-25: 'the same as the grade tools') — an AI app's grid_survey runs THE Point survey pane's Grid step, as a person would: the pane opens
// on the Grid step, the survey, the method and the cell size the call names are put in it, its own 'Generate raster' button is pressed, and what the pane makes or says is read back. Nothing is
// decided here that the pane does not: a run the pane would not start (a profile, too few points, a cell too small, no points in the slice) is refused with the pane's own words. It adds
// one raster; the answer's `revert` (in mcpActions.js) takes out exactly that one. Long (the host answers 'started' + a job id after about 20 s; the pane shows its progress and Cancel).
//   g(): the pane's state and setters, read afresh (GeophysicsModule passes a getter over a ref); the outcome is a raster that was not there before, or the pane's error.
import { useRef } from "react";
import { useModuleAction } from "../lib/menuRequests.js";
import { requestStep } from "../lib/stepRequest.js";

const fail = (error) => ({ ok: false, error });
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lower = (v) => String(v ?? "").trim().toLowerCase();
const METHODS = ["idw", "mincurv"]; // the spline needs the Python engine and its own progress: a person's choice
const text = (e) => String(typeof e === "string" ? e : e?.text ?? "").replace(/\s+/g, " ").trim();

// p: { survey, method?: 'idw' | 'mincurv', cell_m? } -> { ok, changed: 'raster', name, ids, cells, method, survey, note } | { ok: false, error }
export async function gridAction(g, p, { sleep = realSleep, doc = typeof document !== "undefined" ? document : null, runMs = 9 * 60000, openStep = requestStep } = {}) {
  let s = g();
  for (let w = 0; !s && w < 10000; w += 100) { await sleep(100); s = g(); }
  if (!s) return fail("The Point survey pane did not open in GeoStrix. Try again.");
  const surveys = s.measuredList || [];
  if (!surveys.length) return fail("There are no point surveys with values to grid in this project (list_rasters_surveys shows what it holds).");
  const want = lower(p?.survey);
  const hit = surveys.find((x) => lower(x.key) === want) || (want ? surveys.filter((x) => lower(x.key).includes(want)) : []).find((_, i, a) => a.length === 1);
  if (!hit) return fail(`No point survey '${String(p?.survey ?? "").slice(0, 60)}' with values. The surveys: ${surveys.slice(0, 12).map((x) => `'${String(x.key).slice(0, 60)}'`).join(", ")}.`);
  const method = p?.method == null ? null : lower(p.method);
  if (method && !METHODS.includes(method)) return fail("'method' is 'idw' (inverse distance) or 'mincurv' (minimum curvature, the usual gridder for gravity and magnetics).");
  const cell = p?.cell_m == null ? null : Number(p.cell_m);
  if (cell != null && !(cell > 0)) return fail("'cell_m' is the cell size in metres, more than 0 (leave it out for the pane's own: from the station spacing).");
  if (s.idwBusy) return fail("A gridding is already running in GeoStrix: one at a time.");
  // the pane's Grid step, with the choices put in as a person would
  s.setGeoPane("points"); openStep("points", "grid");
  await sleep(300);
  s = g();
  s.setIdwSurvey(hit.key); s.setLegendSurvey?.(hit.key);
  if (method) s.setIdwMethod(method);
  s.setIdwCellText(cell != null ? String(cell) : "");
  for (let w = 0; w < 4000; w += 100) { await sleep(100); s = g(); if (s.idwKey === hit.key && (!method || s.idwMethod === method) && (s.idwCellText ?? "") === (cell != null ? String(cell) : "")) break; }
  await sleep(400); // the derived defaults (the slice, the cell, the blanking) settle
  s = g();
  const before = new Set((s.rasters || []).map((r) => r.id));
  s.setError(null);
  const btn = doc?.querySelector?.('[data-mcp="grid-run"]');
  if (!btn) return fail("The Grid step did not open in GeoStrix. Try again.");
  if (btn.disabled) return fail("A gridding is already running in GeoStrix: one at a time.");
  btn.click();
  for (let w = 0; w < runMs; w += 200) {
    await sleep(200);
    s = g();
    const fresh = (s.rasters || []).find((r) => !before.has(r.id));
    if (fresh) {
      return { ok: true, changed: "raster", name: fresh.name, ids: [fresh.id], survey: hit.key, method: s.idwMethod, cells: fresh.grid ? `${fresh.grid.nx} x ${fresh.grid.ny}` : null, cell_m: fresh.grid ? Number(Number(fresh.grid.dx).toPrecision(4)) : null, note: text(s.error).slice(0, 300) };
    }
    // the pane said something and made nothing (its refusal, or 'Cancelled.'): raster and message land in one render, so a message with no new raster after a moment is the end of the run
    if (s.error && !s.idwBusy) { await sleep(400); s = g(); if (!(s.rasters || []).some((r) => !before.has(r.id))) return fail(text(s.error).slice(0, 400) || "The pane did not grid the survey."); }
  }
  return fail("The gridding is still running in GeoStrix: its progress and Cancel are in the pane.");
}

export function useMcpGrid(getState) {
  const ref = useRef(null);
  ref.current = getState();
  useModuleAction(["mcp-grid-run"], async (_a, p) => {
    const reply = (r) => { try { p?.reply?.(r); } catch { /* gone */ } };
    try { reply(await gridAction(() => ref.current, p)); } catch { reply(fail("The survey could not be gridded.")); }
  });
}

// TASKS.csv #4093 (AI app access batch 5, piece C; Matt, 2026-11-25) — an AI app's grid_hole_values runs THE pane that grids it, as a person would: for 'holes' Maps' "Grid a per-hole value" (HoleValueGridPanel),
// for 'surface' Geochem's "Grid an element to a raster" (SampleGridPanel). The pane opens, the value, the statistic, the placement and the gridding settings the call names are put in it, its own
// "Grid to raster" button is pressed, and what the pane makes or says is read back. Nothing is decided here that the pane does not: a run the pane would not start (a threshold missing, fewer than three
// holes with a value, a cell too small) is refused with the pane's own words. It adds one raster; the answer's `revert` (mcpActions.js) takes out exactly that one.
//   g(): the pane's state and setters, read afresh (the panel passes a getter over a ref); the outcome is a raster that was not there before, or the pane's own message.
import { useRef } from "react";
import { useModuleAction } from "../lib/menuRequests.js";
import { requestStep } from "../lib/stepRequest.js"; // the pane's Grid to raster button is on its LAST step: asked for, as a person would press Next

const fail = (error) => ({ ok: false, error });
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lower = (v) => String(v ?? "").trim().toLowerCase();
const text = (e) => String(typeof e === "string" ? e : e?.text ?? "").replace(/\s+/g, " ").trim();
const METHODS = ["idw", "mincurv", "natneigh"]; // the spline needs the Python engine and its own progress: a person's choice
const HOLE_STATS = ["max", "mean", "firstOver"], CODED_STATS = ["thick", "top", "base", "topRL", "baseRL"];

async function waitFor(g, ok, sleep, ms = 4000) {
  for (let w = 0; w < ms; w += 100) { if (ok(g())) return true; await sleep(100); }
  return ok(g());
}
// the settings every gridding shares: validated, then put in the pane
function checkGridding(p) {
  const method = p?.method == null ? null : lower(p.method);
  if (method && !METHODS.includes(method)) return fail("'method' is 'idw' (inverse distance, the default), 'mincurv' (minimum curvature) or 'natneigh' (natural neighbour).");
  for (const k of ["cell_m", "blank_m"]) if (p?.[k] != null && !(Number(p[k]) > (k === "cell_m" ? 0 : -1))) return fail(`'${k}' is a distance in metres${k === "cell_m" ? ", more than 0" : ""} (leave it out for the pane's own, from the sample spacing).`);
  return { method };
}
// -> the raster the run made, or the pane's refusal, or a timeout
async function press(g, before, doc, mark, runMs, sleep, messageOf, doneNote) {
  const btn = doc?.querySelector?.(`[data-mcp="${mark}"]`);
  if (!btn) return fail("The gridding pane did not open in GeoStrix. Try again.");
  if (btn.disabled) return fail("The pane will not start: it needs at least 3 samples with a value (the pane's own rule).");
  btn.click();
  for (let w = 0; w < runMs; w += 200) {
    await sleep(200);
    let s = g();
    const fresh = (s.rasters || []).find((r) => !before.has(r.id));
    if (fresh) return { fresh, s };
    const m = messageOf(s);
    if (m && !s.busy) { await sleep(400); s = g(); const f2 = (s.rasters || []).find((r) => !before.has(r.id)); if (f2) return { fresh: f2, s }; return fail(text(m).slice(0, 400)); }
  }
  return fail("The gridding is still running in GeoStrix: its progress is in the pane.");
}
const answer = (fresh, extra) => ({ ok: true, changed: "raster", name: fresh.name, ids: [fresh.id], cells: fresh.grid ? `${fresh.grid.nx} x ${fresh.grid.ny}` : null, cell_m: fresh.grid ? Number(Number(fresh.grid.dx).toPrecision(4)) : null, ...extra });
const rowsOf = (done) => Object.fromEntries((done?.rows || []).filter(Boolean).slice(0, 6).map((r) => [String(r.label).slice(0, 40), String(r.value).slice(0, 40)]));

// ---- per-hole values (HoleValueGridPanel) ----
// p: { value, statistic?, threshold?, codes?, placed_at?, depth_as?, method?, cell_m?, blank_m?, log? }
export async function holeGridAction(g, p, { sleep = realSleep, doc = typeof document !== "undefined" ? document : null, runMs = 9 * 60000, openStep = requestStep } = {}) {
  let s = g();
  for (let w = 0; !s && w < 10000; w += 100) { await sleep(100); s = g(); }
  if (!s) return fail("The per-hole value pane did not open in GeoStrix. Try again.");
  if (!s.collars?.length) return fail("This project has no drillholes to grid a value for.");
  const gs = checkGridding(p);
  if (gs.error) return gs;
  if (!s.open) s.setOpen(true);
  await waitFor(g, (x) => x.sources?.length > 0 || x.open, sleep, 2000); await sleep(300);
  openStep("maps-hole-value", "how");
  s = g();
  if (!s.sources.length) return fail("This project has no assays or numeric downhole logs to grid per hole.");
  const want = lower(p?.value);
  const src = s.sources.find((x) => [x.symbol, x.label, x.id].some((n) => lower(n) === want)) || (want ? s.sources.filter((x) => [x.symbol, x.label].some((n) => lower(n).includes(want))).find((_, i, a) => a.length === 1) : null);
  if (!src) return fail(`No assay element or downhole log '${String(p?.value ?? "").slice(0, 60)}' to grid. The choices: ${s.sources.slice(0, 14).map((x) => `'${String(x.label || x.symbol).slice(0, 50)}'`).join(", ")}.`);
  s.setSourceId(src.id); s.setLogChoice?.(null);
  await waitFor(g, (x) => x.source?.id === src.id, sleep);
  const coded = src.kind === "coded", stats = coded ? CODED_STATS : HOLE_STATS;
  const stat = p?.statistic == null ? null : String(p.statistic);
  if (stat && !stats.includes(stat)) return fail(coded ? `'${src.label || src.symbol}' is a coded log: 'statistic' is ${CODED_STATS.join(", ")} (thick = summed thickness of the codes, top / base = depth, topRL / baseRL = elevation).` : `'statistic' is ${HOLE_STATS.join(", ")}: the highest value, the length-weighted mean, or the depth of the first value over 'threshold'.`);
  if (coded) {
    const codes = Array.isArray(p.codes) ? p.codes.map(String) : [];
    if (!codes.length) return fail(`'${src.label || src.symbol}' is a coded log: give 'codes', the logged codes to grid (for example ${src.codes.slice(0, 3).map((c) => c.code).join(", ")}).`);
    const bad = codes.filter((c) => !src.codes.some((x) => lower(x.code) === lower(c)));
    if (bad.length) return fail(`No code ${bad.slice(0, 3).map((c) => `'${c.slice(0, 30)}'`).join(", ")} in '${src.label || src.symbol}'. The codes: ${src.codes.slice(0, 12).map((c) => c.code).join(", ")}.`);
    s.setCodes(codes.map((c) => src.codes.find((x) => lower(x.code) === lower(c)).code));
  }
  if (stat) s.setStat(stat);
  if (stat === "firstOver" || (!stat && s.stat === "firstOver")) { if (!(Number(p?.threshold) > 0)) return fail("'firstOver' needs 'threshold': the value the depth is measured to (in the element's unit)."); s.setThreshold(String(Number(p.threshold))); }
  else if (p?.threshold != null) s.setThreshold(String(Number(p.threshold)));
  if (p?.placed_at != null) { if (!["collar", "intercept"].includes(p.placed_at)) return fail("'placed_at' is 'collar' or 'intercept' (the middle of the interval down the desurveyed hole)."); s.setPlaceAtChoice(p.placed_at); }
  if (p?.depth_as != null) { if (!["along", "vertical"].includes(p.depth_as)) return fail("'depth_as' is 'along' (down the hole) or 'vertical'."); s.setDepthAs(p.depth_as); }
  if (gs.method) s.setMethod(gs.method);
  s.setCell(p?.cell_m != null ? String(Number(p.cell_m)) : ""); s.setBlank(p?.blank_m != null ? String(Number(p.blank_m)) : "");
  if (p?.log != null) s.setLogChoice(!!p.log);
  await sleep(500);
  s = g();
  const before = new Set((s.rasters || []).map((r) => r.id));
  s.setMsg(null);
  const r = await press(g, before, doc, "hole-grid-run", runMs, sleep, (x) => x.msg && x.msg.err ? x.msg : null);
  if (!r.fresh) return r;
  return answer(r.fresh, { source: "holes", value: src.label || src.symbol, statistic: r.s.stat, method: r.s.method, result: rowsOf(r.s.done) });
}

// ---- surface samples (SampleGridPanel) ----
// p: { value, medium?, method?, cell_m?, blank_m?, log? }
export async function sampleGridAction(g, p, { sleep = realSleep, doc = typeof document !== "undefined" ? document : null, runMs = 9 * 60000, openStep = requestStep } = {}) {
  let s = g();
  for (let w = 0; !s && w < 10000; w += 100) { await sleep(100); s = g(); }
  if (!s) return fail("The surface sample grid pane did not open in GeoStrix. Try again.");
  if (!s.surfaceElements?.length || !s.surfaceSamples?.length) return fail("This project has no surface samples to grid.");
  const gs = checkGridding(p);
  if (gs.error) return gs;
  const want = lower(p?.value);
  const el = s.surfaceElements.find((e) => lower(e.symbol) === want);
  if (!el) return fail(`No surface element '${String(p?.value ?? "").slice(0, 32)}'. The elements: ${s.surfaceElements.slice(0, 20).map((e) => e.symbol).join(", ")}.`);
  let medium = "";
  if (p?.medium != null) {
    const m = s.media.find((x) => lower(x) === lower(p.medium));
    if (!m) return fail(`No sampling medium '${String(p.medium).slice(0, 40)}'. The media: ${s.media.slice(0, 12).join(", ")}.`);
    medium = m;
  }
  if (!s.open) s.setOpen(true);
  await sleep(400);
  openStep("geochem-grid", "how");
  await sleep(300);
  s = g();
  s.setSymbol(el.symbol); s.setMedium(medium); s.setLogChoice?.(p?.log != null ? !!p.log : null);
  if (gs.method) s.setMethod(gs.method);
  s.setCell(p?.cell_m != null ? String(Number(p.cell_m)) : ""); s.setBlank(p?.blank_m != null ? String(Number(p.blank_m)) : "");
  await waitFor(g, (x) => x.symbol === el.symbol && x.medium === medium && (!gs.method || x.method === gs.method), sleep);
  await sleep(500);
  s = g();
  const before = new Set((s.rasters || []).map((r) => r.id));
  s.clearNote();
  const r = await press(g, before, doc, "sample-grid-run", runMs, sleep, (x) => (x.lastNote && !/^Gridded /.test(x.lastNote) ? x.lastNote : null));
  if (!r.fresh) return r;
  return answer(r.fresh, { source: "surface", value: el.symbol, ...(medium ? { medium } : {}), method: r.s.method, result: rowsOf(r.s.done), ...(r.s.lastNote ? { note: text(r.s.lastNote).slice(0, 300) } : {}) });
}

export function useMcpHoleGrid(getState) {
  const ref = useRef(null);
  ref.current = getState();
  useModuleAction(["mcp-hole-grid-run"], async (_a, p) => {
    const reply = (r) => { try { p?.reply?.(r); } catch { /* gone */ } };
    try { reply(await holeGridAction(() => ref.current, p)); } catch { reply(fail("The per-hole value could not be gridded.")); }
  });
}
export function useMcpSampleGrid(getState) {
  const ref = useRef(null);
  ref.current = getState();
  useModuleAction(["mcp-sample-grid-run"], async (_a, p) => {
    const reply = (r) => { try { p?.reply?.(r); } catch { /* gone */ } };
    try { reply(await sampleGridAction(() => ref.current, p)); } catch { reply(fail("The surface samples could not be gridded.")); }
  });
}

// TASKS.csv #4053 (AI app access batch 4, Matt 2026-11-24, Modelling) — an AI app's model_from_map runs THE Model from map pane (#817 / #4001), as a person would: StrixViewer opens the
// pane ("mcp-map-model-open"), the map and the settings the call names are put in the pane (the map's own age order by default, the relation, the faults the pane's "Pick for me" keeps),
// the pane's own Build the model (GemPy) button is pressed, and the fit card's numbers are read back. Nothing is decided here that the pane does not: a run the pane would not start (no map,
// no terrain, under two units, no orientation, more units than GemPy takes) is refused with the pane's own words. Long (the host answers 'started' + a job id after about 20 s; the
// status bar shows the engine's progress and its Cancel). It adds the model's surfaces and the two map rasters (what the run drew); the answer's `revert` takes out exactly those.
//   g(): the pane's state and functions, read afresh (MapModelPanel passes a getter); the answer's figures are the fit card's, and the order, relation and faults are the ones the run used.
import { useRef } from "react";
import { useModuleAction } from "../lib/menuRequests.js";
import { GEMPY_MAX_SURFACES } from "../lib/gempyLimits.js";
import { requestStep } from "../lib/stepRequest.js"; // TASKS.csv #4070

const fail = (error) => ({ ok: false, error });
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const lower = (v) => clean(v).toLowerCase();
const noticeText = (n) => (typeof n === "string" ? n : n?.message ?? n?.text ?? "");
// the pane's own test for a fault line (MapModelPanel's faultFeatures): an attribute that says fault, thrust or shear
export const faultFeaturesOf = (l) => (l?.features || []).filter((f) => Object.values(f.attributes || {}).some((v) => /fault|thrust|shear/i.test(String(v)))).length;
const RELATIONS = { conformable: "onlap", onlap: "onlap", erosional: "erode", erode: "erode" };
const pct = (v) => (v == null ? null : Math.round(100 * v));

// the pane's derived state settles after a choice (the order and the fault list are recomputed): nothing changes for a moment
async function settle(g, sleep, waitMs = 8000) {
  let calm = 0, last = null;
  for (let w = 0; ; w += 100) {
    const s = g(), sig = `${s.layer?.id}|${s.unitField}|${s.order.join(",")}|${s.relation}|${s.orderFrom}|${s.faultLayer?.id}|${s.faults.length}|${s.faultPick ? 1 : 0}|${s.plan ? 1 : 0}`;
    calm = sig === last ? calm + 100 : 0; last = sig;
    if (calm >= 500) return true;
    if (w > waitMs) return false;
    await sleep(100);
  }
}

// p: { map?, order_from?: 'age' | 'bedding', relation?: 'Conformable' | 'Erosional', faults?: 'auto' | 'none' | <a line layer's name> }; env: { getSurfaces, getRasters, getNotices }
// -> { ok, changed, built, ids, raster_ids, fit, order, relation, faults, ... , revert } | { ok: false, error }
export async function mapModelAction(g, p, { sleep = realSleep, runMs = 9 * 60000, doc = typeof document !== "undefined" ? document : null, getSurfaces = () => [], getRasters = () => [], getNotices = () => [], started = () => {}, expired = () => false, removeSurfaces = null } = {}) {
  let s = g();
  for (let w = 0; !s && w < 10000; w += 100) { await sleep(100); s = g(); }
  if (!s || expired()) return fail("Model from map did not open in GeoStrix. Try again."); // expired: the call was refused already (no pane in time)
  started();
  if (!s.polys.length) return fail(s.noMapMsg);
  if (s.busy) return fail("Another model is running in GeoStrix: one at a time. Try again when it has finished.");
  // the map: the pane's own default (a shown, mapped layer) unless named
  if (p?.map) {
    const want = lower(p.map), l = s.polys.find((x) => lower(x.name) === want);
    if (!l) return fail(`No geological map '${clean(p.map).slice(0, 60)}' (polygons) in this project. The maps: ${s.polys.map((x) => x.name).slice(0, 12).join(", ")}.`);
    if (s.layer?.id !== l.id) s.setLayerId(l.id);
  }
  await settle(g, sleep);
  // the order: the pane opens on the map's own age order when most units carry an age; 'bedding' is its one-click alternative
  if (p?.order_from) {
    const want = lower(p.order_from);
    if (want !== "age" && want !== "bedding") return fail("'order_from' is 'age' (the map's own ages, the default when most units carry one) or 'bedding' (bedding younging).");
    s = g();
    if (want === "age" && !s.ageSug?.use) return fail("This map does not give ages for most of its units, so the order cannot follow the map's ages: the order is bedding younging (leave 'order_from' out or say 'bedding').");
    if (s.orderFrom !== want) s.setOrderFrom(want);
    await settle(g, sleep);
  }
  if (p?.relation != null) {
    const rel = RELATIONS[lower(p.relation)];
    if (!rel) return fail("'relation' is 'Conformable' (one shared field: units cannot pinch out, the pane's default) or 'Erosional' (each unit truncates those below).");
    if (g().relation !== rel) g().setRelation(rel);
    await settle(g, sleep);
  }
  // the faults: the line layer with the most fault lines, unless named (or 'none'); more than GemPy takes: the pane's own "Pick for me"
  const wantF = p?.faults == null ? "auto" : lower(p.faults);
  let layerF = null;
  if (wantF === "auto") layerF = [...s.lines].map((l) => [l, faultFeaturesOf(l)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  else if (wantF !== "none") {
    layerF = s.lines.find((l) => lower(l.name) === wantF) || null;
    if (!layerF) return fail(`No line layer '${clean(p.faults).slice(0, 60)}' for the faults. The line layers: ${s.lines.map((l) => l.name).slice(0, 12).join(", ") || "none"}. Say 'none' to leave faults out, or 'auto'.`);
  }
  if ((g().faultLayer?.id || "") !== (layerF?.id || "")) g().setFaultLayerId(layerF?.id || "");
  await settle(g, sleep);
  let picked = null;
  if (g().faultPlan) { g().takeFaults(); await settle(g, sleep); const n = g(); picked = { kept: n.faultPick?.keep ?? null, of: n.faultPick?.before ?? null }; }
  s = g();
  // what the pane would say instead of starting
  if (!s.groundAt) return fail(s.noTerrainMsg);
  if (s.order.length < 2) return fail(s.fewUnitsMsg);
  if (s.noOrient) return fail(s.noOrientMsg);
  if (s.plan) return fail(`The map's order has ${s.order.length} units and GemPy takes at most ${GEMPY_MAX_SURFACES}. Model from map is open in GeoStrix with its offer to merge and leave out units (it says why for each): take it there, or change the roles, then ask again.`);
  requestStep("mapmodel", "data"); await settle(g, sleep); // TASKS.csv #4070 — the pane is steps: its Build button is on the Data step
  const button = doc?.querySelector('[data-mcp="map-run"]');
  if (!button || button.disabled) return fail("Model from map would not start with these settings: its Build button is not available. Its messages are in the pane open in GeoStrix.");
  const order = s.order.slice(), relation = s.relation, byAge = !!s.byAge, usedFaults = (s.faults || []).filter((f) => f.on).map((f) => f.name);
  const surfBefore = new Set(getSurfaces().map((x) => x.id)), rasterBefore = new Set(getRasters().map((x) => x.id)), noticesBefore = new Set(getNotices() || []);
  button.click();
  let saw = false;
  for (let w = 0; ; w += 100) {
    await sleep(100);
    const n = g();
    if (n.busy) saw = true; else if (saw || w > 4000) break;
    if (w > runMs) return fail("Model from map is still running in GeoStrix; its progress is in the status bar (Cancel stops it).");
  }
  for (let w = 0; w < 4000 && !g().fit; w += 100) await sleep(100); // the fit card arrives with the run's last step
  s = g();
  const made = getSurfaces().filter((x) => !surfBefore.has(x.id)), rasterIds = getRasters().filter((x) => !rasterBefore.has(x.id)).map((x) => x.id);
  const said = (getNotices() || []).filter((x) => !noticesBefore.has(x)).map(noticeText).map(clean).filter(Boolean);
  if (!made.length) return fail(said.length ? `Nothing was built: ${said.slice(-2).join(" ").slice(0, 900)}` : "Nothing was built: it was cancelled, or the run stopped with a message (the messages under the sidebar say why).");
  const f = s.fit;
  return { ok: true, changed: "model from map", built: made.map((x) => clean(x.name).slice(0, 80)).slice(0, 40), ids: made.map((x) => x.id), ...(rasterIds.length ? { raster_ids: rasterIds } : {}),
    map: clean(s.layer?.name).slice(0, 80), unit_field: s.unitField, order, order_from: byAge ? "the map's ages" : "bedding younging", relation: relation === "erode" ? "Erosional" : "Conformable",
    faults: usedFaults.slice(0, 12), ...(picked ? { faults_picked: picked.kept != null ? `${picked.kept} of ${picked.of}: the pane's Pick for me` : null } : {}),
    fit: f ? { matches_the_map_percent: pct(f.overall), per_unit: (f.units || []).slice(0, 12).map((u) => ({ unit: clean(u.unit).slice(0, 60), percent: pct(u.pct), ...(u.pct != null && u.pct < 0.5 && u.modelledAs ? { mostly: clean(u.modelledAs).slice(0, 60) } : {}) })), not_scored: (f.unscored || []).slice(0, 8), cells_that_differ: f.differ ?? null, ...(f.overall == null ? { note: "The model has none of the mapped units here, so its fit to the map cannot be scored." } : {}) } : { note: "No fit was scored for this run." },
    notes: said.slice(-4).map((t) => t.slice(0, 400)),
    revert: (st) => { try { (removeSurfaces?.() || st?.removeSurfaces)?.(made.map((x) => x.id)); } catch { /* already gone */ } for (const id of rasterIds) { try { if ((st?.rasters || []).some((r) => r.id === id)) st.removeRaster?.(id); } catch { /* already gone */ } } } };
}

// in MapModelPanel: useMcpMapModel(() => ({ ...the pane's state and functions }))
export function useMcpMapModel(get) {
  const ref = useRef(get); ref.current = get;
  useModuleAction(["mcp-map-model"], (_a, p) => {
    let done; try { done = mapModelAction(() => ref.current(), p, p?.env || {}); } catch { done = Promise.resolve(fail("The model could not be run.")); }
    done.catch(() => fail("The model could not be run.")).then((r) => { try { p?.reply?.(r); } catch { /* the app has gone */ } });
  });
}

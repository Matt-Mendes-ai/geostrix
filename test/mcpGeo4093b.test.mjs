// TASKS.csv #4093 (AI app access, batch 5, piece B) — filter_raster (the Raster pane's own runFilter with an AI app's settings) and grid_survey (the Point survey pane's own Grid step, driven as a
// person would). The checks made before the panes run, what each reads back, and that the toast's Undo takes out exactly the raster added. The panes themselves are run in the live check (a test
// Electron, a scripted client through mcp-bridge.ps1); here the panes are stood in for, and the source is pinned where the wiring matters. Every project here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pickRaster, filterPlan, FILTER_KINDS } from "../src/lib/mcpFilter.js";
import { gridAction } from "../src/components/useMcpGrid.js";
import { runChange } from "../src/lib/mcpActions.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const defs = JSON.parse(read("../electron/mcpToolDefs.json")), by = Object.fromEntries(defs.map((d) => [d.name, d]));
const mag = { id: "raster_1", name: "Mag TMI", grid: { nx: 120, ny: 80, dx: 25 }, units: "nT", surveyMethod: "mag" };
const grav = { id: "raster_2", name: "Bouguer", grid: { nx: 60, ny: 40, dx: 100 }, units: "mGal", surveyMethod: "grav" };
const rad = { id: "raster_3", name: "Total count", grid: { nx: 60, ny: 40, dx: 50 }, units: "cps", surveyMethod: "rad_tc" };
const unknown = { id: "raster_4", name: "Imported", grid: { nx: 10, ny: 10, dx: 10 } };
const pic = { id: "raster_5", name: "Satellite" };
const rasters = [mag, grav, rad, unknown, pic];

test("pickRaster: the id, the name, the only name that contains it; pictures and unknown names are said", () => {
  assert.equal(pickRaster(rasters, "raster_1").raster, mag);
  assert.equal(pickRaster(rasters, "bouguer").raster, grav);
  assert.equal(pickRaster(rasters, "total").raster, rad);
  assert.match(pickRaster(rasters, "").error, /Say which raster/);
  assert.match(pickRaster(rasters, "Satellite").error, /is a picture/);
  assert.match(pickRaster(rasters, "zzz").error, /No raster 'zzz' with grid values/);
  assert.match(pickRaster([...rasters, { id: "r9", name: "Mag TMI RTP", grid: { nx: 1, ny: 1, dx: 1 } }], "mag").error, /More than one raster matches 'mag'/);
});

test("filterPlan: the pane's own checks, in words; the settings the pane's filter state gets", () => {
  const plan = (r, a) => filterPlan(r, {}, a);
  assert.deepEqual(FILTER_KINDS, ["vd1", "as", "tilt", "upward", "rtp", "rtpa", "rte"]);
  const ok = plan(mag, { filter: "vd1" });
  assert.equal(ok.ok, true); assert.equal(ok.filt.kind, "vd1"); assert.equal(ok.needsField, false);
  assert.match(plan(mag, { filter: "worms" }).error, /Unknown filter 'worms'/);
  assert.match(plan(mag, { filter: "upward" }).error, /needs 'height'/);
  assert.equal(plan(mag, { filter: "upward", height: 50 }).filt.height, "50");
  // field reductions: both angles, or a date, never one angle
  assert.match(plan(mag, { filter: "rtp" }).error, /needs the survey's field/);
  assert.match(plan(mag, { filter: "rtp", inclination: 60 }).error, /both 'inclination' and 'declination'/);
  assert.match(plan(mag, { filter: "rtp", inclination: 95, declination: 10 }).error, /within ±90°/);
  const r = plan(mag, { filter: "rtp", inclination: 70, declination: -15 });
  assert.deepEqual([r.filt.inclination, r.filt.declination, r.needsField], ["70", "-15", false]);
  const d = plan(mag, { filter: "rte", date: "2020-06-01" });
  assert.deepEqual([d.ok, d.needsField, d.filt.date], [true, true, "2020-06-01"]);
  assert.match(plan(mag, { filter: "rtp", date: "June 2020" }).error, /YYYY-MM-DD/);
  // the pane's survey-method rules
  assert.match(plan(grav, { filter: "rtp", inclination: 60, declination: 0 }).error, /needs a magnetic grid; this one is gravity/);
  assert.equal(plan(grav, { filter: "vd1" }).ok, true, "derivatives work on gravity");
  assert.match(plan(rad, { filter: "vd1" }).error, /for magnetic and gravity grids; 'Total count' is Radiometrics: total count/);
  assert.match(plan(unknown, { filter: "rtp", inclination: 60, declination: 0 }).error, /survey method is not set/);
  assert.match(plan(unknown, { filter: "vd1" }).error, /survey method is not set/, "the pane asks for the method before any potential-field filter on an unknown grid");
});

// the Point survey pane, stood in for: its state, its Generate raster button, what pressing it does
function pane({ surveys = [{ key: "mag.csv", count: 500 }, { key: "grav.csv", count: 80 }], onClick } = {}) {
  const st = { measuredList: surveys, idwKey: surveys[0]?.key || "", idwMethod: "idw", idwCellText: "", idwBusy: null, rasters: [], error: "old message", geoPane: "points", steps: [] };
  Object.assign(st, {
    setGeoPane: (p) => { st.geoPane = p; }, setIdwSurvey: (k) => { st.idwKey = k; }, setLegendSurvey: () => {}, setIdwMethod: (m) => { st.idwMethod = m; }, setIdwCellText: (t) => { st.idwCellText = t; }, setError: (e) => { st.error = e; },
  });
  const button = { disabled: false, click() { onClick?.(st); } };
  return { st, g: () => ({ ...st }), doc: { querySelector: (q) => (q === '[data-mcp="grid-run"]' ? button : null) }, button, openStep: (id, key) => st.steps.push([id, key]) };
}
const run = (p, a) => gridAction(p.g, a, { sleep: async () => {}, doc: p.doc, openStep: p.openStep, runMs: 4000 });

test("grid_survey: the pane opens on the Grid step, the choices go in, its button is pressed, and the raster it made is read back", async () => {
  const p = pane({ onClick: (st) => { st.rasters = [{ id: "r_new", name: "mag.csv min. curvature 25 m", grid: { nx: 120, ny: 80, dx: 25 } }]; st.error = { info: true, text: "Gridded \"mag.csv\" (500 points) at 25 m: 9,000 of 9,600 cells have a value." }; } });
  const r = await run(p, { survey: "MAG.csv", method: "mincurv", cell_m: 25 });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.changed, r.name, r.ids, r.cells, r.cell_m, r.survey, r.method], ["raster", "mag.csv min. curvature 25 m", ["r_new"], "120 x 80", 25, "mag.csv", "mincurv"]);
  assert.match(r.note, /^Gridded "mag.csv" \(500 points\)/);
  assert.deepEqual(p.st.steps, [["points", "grid"]]); assert.equal(p.st.geoPane, "points");
  assert.deepEqual([p.st.idwKey, p.st.idwMethod, p.st.idwCellText], ["mag.csv", "mincurv", "25"]);
  // a partial survey name picks the only match; no method / cell leaves the pane's own
  const q = pane({ onClick: (st) => { st.rasters = [{ id: "r2", name: "g", grid: { nx: 5, ny: 5, dx: 100 } }]; st.error = { info: true, text: "Gridded" }; } });
  const r2 = await run(q, { survey: "grav" });
  assert.equal(r2.ok, true); assert.deepEqual([q.st.idwKey, q.st.idwMethod, q.st.idwCellText], ["grav.csv", "idw", ""]);
});

test("grid_survey: the pane's own refusal comes back in its words; a cancelled run, an unknown survey, a bad method or cell, a busy pane, no button", async () => {
  let r = await run(pane({ onClick: (st) => { st.error = "Plot these 80 points as a profile: they lie on one line."; } }), { survey: "grav.csv" });
  assert.equal(r.ok, false); assert.match(r.error, /^Plot these 80 points as a profile/);
  r = await run(pane({ onClick: (st) => { st.error = { info: true, text: "Cancelled." }; } }), { survey: "mag.csv" });
  assert.equal(r.ok, false); assert.match(r.error, /^Cancelled\./);
  r = await run(pane(), { survey: "nope.csv" }); assert.match(r.error, /No point survey 'nope.csv' with values\. The surveys: 'mag.csv', 'grav.csv'/);
  r = await run(pane(), { survey: "mag.csv", method: "spline" }); assert.match(r.error, /'method' is 'idw'/);
  r = await run(pane(), { survey: "mag.csv", cell_m: -5 }); assert.match(r.error, /'cell_m' is the cell size in metres/);
  r = await run(pane({ surveys: [] }), { survey: "x" }); assert.match(r.error, /no point surveys with values to grid/);
  const busy = pane(); busy.st.idwBusy = "Gridding…"; assert.match((await run(busy, { survey: "mag.csv" })).error, /already running/);
  const dis = pane(); dis.button.disabled = true; assert.match((await run(dis, { survey: "mag.csv" })).error, /already running/);
  assert.match((await gridAction(pane().g, { survey: "mag.csv" }, { sleep: async () => {}, doc: { querySelector: () => null }, openStep() {} })).error, /Grid step did not open/);
  // the pane's previous message is cleared before the press, so it is never mistaken for this run's
  const stale = pane({ onClick: () => {} });
  const t = await gridAction(stale.g, { survey: "mag.csv" }, { sleep: async () => {}, doc: stale.doc, openStep: stale.openStep, runMs: 600 });
  assert.equal(stale.st.error, null); assert.match(t.error, /still running/);
});

// the module routes of the two tools, answered the way the panes' useModuleAction handlers do
function standIn(replyFor) {
  if (!globalThis.window) globalThis.window = new EventTarget();
  const on = (e) => { const { action, payload } = e.detail; const r = replyFor(action, payload); if (r) payload.reply(r); };
  window.addEventListener("geostrix-module-action", on);
  return () => window.removeEventListener("geostrix-module-action", on);
}
const store = () => { const s = { rasters: [{ id: "keep" }, { id: "rf" }], undoCheckpoint() {}, goToModule: (t) => { s.tab = t; }, removeRaster: (id) => { s.rasters = s.rasters.filter((x) => x.id !== id); } }; return s; };

test("filter_raster and grid_survey as changes: the module is asked, a short answer, the toast's Undo takes out exactly the raster added", async () => {
  const seen = [];
  const off = standIn((action, p) => {
    seen.push([action, { ...p, reply: undefined }]);
    if (action === "mcp-filter-raster") return { ok: true, changed: "raster", name: "Mag TMI - First vertical derivative (1VD)", ids: ["rf"], filter: "vd1", units: "nT/m", warning: "Edge cells are less certain." };
    if (action === "mcp-grid-run") return { ok: true, changed: "raster", name: "mag.csv IDW 25 m", ids: ["rf"], survey: "mag.csv", method: "idw", cells: "120 x 80", cell_m: 25 };
    return null;
  });
  try {
    for (const [tool, args, tab, route] of [["filter_raster", { raster: "Mag TMI", filter: "vd1" }, "maps", "mcp-filter-raster"], ["grid_survey", { survey: "mag.csv", cell_m: 25 }, "geophysics", "mcp-grid-run"]]) {
      const s = store(), toasts = [];
      const r = await runChange(tool, args, { getStore: () => s, client: "Claude Desktop", settle: async () => {}, toast: (t) => toasts.push(t) });
      assert.equal(r.ok, true, r.error);
      assert.equal(r.data.changed, "raster"); assert.equal(r.data.id, "rf"); assert.equal(s.tab, tab);
      assert.equal(seen.at(-1)[0], route);
      assert.ok(JSON.stringify(r.data).length < 400, "a short answer");
      assert.match(toasts[0].message, /^Claude Desktop: added the raster '/);
      toasts[0].undo();
      assert.deepEqual(s.rasters.map((x) => x.id), ["keep"], "only the raster this change added");
    }
    assert.deepEqual(seen[0][1], { raster: "Mag TMI", filter: "vd1", height: undefined, inclination: undefined, declination: undefined, date: undefined, reply: undefined });
    // a refusal from the pane is the answer, nothing is toasted
    off();
    const off2 = standIn((a) => (a === "mcp-filter-raster" ? { ok: false, error: "A grid filter is already running in GeoStrix: one at a time." } : null));
    const s = store(), toasts = [];
    const r = await runChange("filter_raster", { raster: "x", filter: "as" }, { getStore: () => s, client: "x", settle: async () => {}, toast: (t) => toasts.push(t) });
    off2(); assert.equal(r.ok, false); assert.match(r.error, /already running/); assert.equal(toasts.length, 0);
  } finally { off(); }
});

test("wiring: the Raster pane runs its own runFilter with the call's settings and reads back what it said; the Point survey pane's own button is the one pressed; the routes and the schemas", () => {
  const raster = read("../src/modules/RasterModule.jsx");
  assert.match(raster, /const filtState = filt, doneState = done, setErrorState = \(e\) => setError\(e\);/);
  assert.match(raster, /const runFilter = async \(r, ov = null\) => \{\s+const filt = ov \? ov\.filt : filtState;/);
  assert.match(raster, /if \(!ov && unknownNeedsTick\(r\)\) return;/);
  assert.match(raster, /const newId = addRaster\(\{ \.\.\.nr, drapeMode: place\.drapeMode, elevation: place\.elevation \}\);\s+if \(ov\) ov\.out = \{ \.\.\.\(ov\.out \|\| \{\}\), id: newId, name: nr\.name, units: ou\.units, filter: filt\.kind, warning: out\.warning \|\| null \};/);
  assert.match(raster, /useModuleAction\(\["mcp-filter-run"\]/); assert.match(raster, /await runFilter\(r, ov\);/);
  assert.match(read("../src/modules/MapsModule.jsx"), /useModuleAction\(\["mcp-filter-raster"\], \(_a, p\) => \{ setPane\("raster"\); requestModuleAction\("mcp-filter-run", p\); \}\);/);
  const geo = read("../src/modules/GeophysicsModule.jsx");
  assert.match(geo, /useMcpGrid\(\(\) => \(\{ geoPane, setGeoPane, measuredList, idwKey, setIdwSurvey, setLegendSurvey, idwMethod, setIdwMethod, idwCellText, setIdwCellText, idwBusy, rasters, error, setError \}\)\);/);
  assert.match(geo, /disabled=\{!!idwBusy\} data-mcp="grid-run"/);
  for (const n of ["filter_raster", "grid_survey"]) { assert.match(by[n].description, /^Makes a change in GeoStrix:/); assert.equal(by[n].annotations.readOnlyHint, false); assert.equal(by[n].annotations.openWorldHint, false, "no network"); assert.equal(by[n]._meta["geostrix/long"], true); }
  assert.deepEqual(by.filter_raster.inputSchema.properties.filter.enum, FILTER_KINDS); assert.deepEqual(by.filter_raster.inputSchema.required, ["raster", "filter"]);
  assert.deepEqual(by.grid_survey.inputSchema.properties.method.enum, ["idw", "mincurv"]);
});

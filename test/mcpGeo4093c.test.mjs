// TASKS.csv #4093 (AI app access, batch 5, piece C) — grid_hole_values (the per-hole value pane in Maps, the surface-sample grid pane in Geochem) and anomaly_score (the Multivariate anomaly score
// dialog): each runs the pane's own button with the choices the call names, and reads back what it made or said. The panes are stood in for here (their state, setters and buttons); the real panes are
// run in the live check (a test Electron, Blake River / Silvertip-like data). Every project here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holeGridAction, sampleGridAction } from "../src/components/useMcpValueGrid.js";
import { anomalyAction } from "../src/components/useMcpAnomaly.js";
import { runChange } from "../src/lib/mcpActions.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const defs = JSON.parse(read("../electron/mcpToolDefs.json")), by = Object.fromEntries(defs.map((d) => [d.name, d]));
const sleep = async () => {};

// ---- the per-hole value pane
const SOURCES = [{ id: "a:Au", symbol: "Au", kind: "assay", unit: "ppm" }, { id: "a:Cu", symbol: "Cu", kind: "assay", unit: "ppm" }, { id: "log:magsus", symbol: "magsus", label: "Magnetic susceptibility", kind: "log", unit: "SI" },
  { id: "c:litho", symbol: "Lithology", label: "Lithology", kind: "coded", unit: "m", codes: [{ code: "AND", n: 5 }, { code: "DYK", n: 2 }] }];
function holePane({ onClick, collars = [{}, {}, {}], sources = SOURCES } = {}) {
  const st = { collars, open: false, sourceId: "", stat: "max", threshold: "", method: "idw", cell: "", blank: "", log: null, codes: [], placeAt: null, depthAs: "along", msg: "old", rasters: [], done: null, calls: [] };
  const api = {
    setOpen: (o) => { st.open = !!o; }, setSourceId: (id) => { st.sourceId = id; }, setLogChoice: (v) => { st.log = v; }, setCodes: (c) => { st.codes = c; }, setStat: (x) => { st.stat = x; }, setThreshold: (t) => { st.threshold = t; },
    setPlaceAtChoice: (v) => { st.placeAt = v; }, setDepthAs: (v) => { st.depthAs = v; }, setMethod: (m) => { st.method = m; }, setCell: (c) => { st.cell = c; }, setBlank: (b) => { st.blank = b; }, setMsg: (m) => { st.msg = m; },
  };
  const button = { disabled: false, click() { onClick?.(st); } };
  return { st, button, g: () => ({ ...st, ...api, sources: st.open ? sources : [], source: sources.find((x) => x.id === st.sourceId) || sources[0], stat: st.stat }), doc: { querySelector: (q) => (q === '[data-mcp="hole-grid-run"]' ? button : null) } };
}
const holeRun = (p, a) => holeGridAction(p.g, a, { sleep, doc: p.doc, runMs: 3000, openStep: (id, k) => (p.st.steps ||= []).push([id, k]) });
const made = (st, name = "Au highest per hole IDW 50 m") => { st.rasters = [{ id: "r_new", name, grid: { nx: 30, ny: 20, dx: 50 } }]; st.done = { rows: [{ label: "Holes gridded", value: "37" }, { label: "Cells with a value", value: "400 / 600" }] }; };

test("grid_hole_values (holes): the pane opens, the value and the choices go in, its button is pressed, the raster and its numbers come back", async () => {
  const p = holePane({ onClick: (st) => made(st) });
  const r = await holeRun(p, { source: "holes", value: "au", statistic: "mean", placed_at: "intercept", method: "mincurv", cell_m: 50, blank_m: 200, log: true });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.changed, r.name, r.ids, r.cells, r.cell_m, r.source, r.value, r.statistic, r.method], ["raster", "Au highest per hole IDW 50 m", ["r_new"], "30 x 20", 50, "holes", "Au", "mean", "mincurv"]);
  assert.deepEqual(r.result, { "Holes gridded": "37", "Cells with a value": "400 / 600" });
  assert.deepEqual(p.st.steps, [["maps-hole-value", "how"]], "the pane's Grid to raster button is on its last step: asked for");
  assert.deepEqual([p.st.open, p.st.sourceId, p.st.stat, p.st.placeAt, p.st.method, p.st.cell, p.st.blank, p.st.log, p.st.msg], [true, "a:Au", "mean", "intercept", "mincurv", "50", "200", true, null]);
  // a log by its label, a partial name that is the only match
  const q = holePane({ onClick: (st) => made(st, "x") });
  assert.equal((await holeRun(q, { source: "holes", value: "Magnetic susceptibility" })).ok, true); assert.equal(q.st.sourceId, "log:magsus");
  const q2 = holePane({ onClick: (st) => made(st, "x") });
  assert.equal((await holeRun(q2, { source: "holes", value: "magnetic" })).ok, true); assert.equal(q2.st.sourceId, "log:magsus");
});

test("grid_hole_values (holes): coded logs need codes and take their own statistics; firstOver needs a threshold; every refusal says what to give", async () => {
  const ok = (st) => made(st, "Lithology AND thickness");
  let p = holePane({ onClick: ok });
  assert.equal((await holeRun(p, { source: "holes", value: "Lithology", codes: ["and", "DYK"], statistic: "topRL" })).ok, true);
  assert.deepEqual([p.st.codes, p.st.stat], [["AND", "DYK"], "topRL"]);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Lithology" })).error, /coded log: give 'codes'.*AND, DYK/);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Lithology", codes: ["ZZ"] })).error, /No code 'ZZ' in 'Lithology'\. The codes: AND, DYK/);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Lithology", codes: ["AND"], statistic: "max" })).error, /coded log: 'statistic' is thick, top, base, topRL, baseRL/);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Au", statistic: "thick" })).error, /'statistic' is max, mean, firstOver/);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Au", statistic: "firstOver" })).error, /'firstOver' needs 'threshold'/);
  p = holePane({ onClick: ok });
  assert.equal((await holeRun(p, { source: "holes", value: "Au", statistic: "firstOver", threshold: 0.5 })).ok, true); assert.equal(p.st.threshold, "0.5");
  assert.match((await holeRun(holePane(), { source: "holes", value: "Zn" })).error, /No assay element or downhole log 'Zn' to grid\. The choices: 'Au', 'Cu', 'Magnetic susceptibility', 'Lithology'/);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Au", method: "spline" })).error, /'method' is 'idw'/);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Au", cell_m: 0 })).error, /'cell_m' is a distance in metres, more than 0/);
  assert.match((await holeRun(holePane(), { source: "holes", value: "Au", placed_at: "toe" })).error, /'placed_at' is 'collar' or 'intercept'/);
  assert.match((await holeRun(holePane({ collars: [] }), { source: "holes", value: "Au" })).error, /no drillholes/);
  assert.match((await holeRun(holePane({ sources: [] }), { source: "holes", value: "Au" })).error, /no assays or numeric downhole logs/);
});

test("grid_hole_values (holes): the pane's own refusal comes back in its words; a pane that will not start (under three values) says so", async () => {
  let r = await holeRun(holePane({ onClick: (st) => { st.msg = { err: true, text: "Too few holes with a value to grid (2): at least 3 are needed." }; } }), { source: "holes", value: "Au" });
  assert.equal(r.ok, false); assert.match(r.error, /^Too few holes with a value to grid \(2\)/);
  const dis = holePane(); dis.button.disabled = true;
  assert.match((await holeRun(dis, { source: "holes", value: "Au" })).error, /needs at least 3 samples with a value/);
  assert.match((await holeGridAction(holePane().g, { value: "Au" }, { sleep, doc: { querySelector: () => null }, runMs: 100 })).error, /did not open/);
});

// ---- the surface-sample grid pane
function samplePane({ onClick } = {}) {
  const st = { surfaceSamples: [{}], surfaceElements: [{ symbol: "Cu", unit: "ppm" }, { symbol: "Zn", unit: "ppm" }], open: false, symbol: "Cu", medium: "", media: ["rock chip", "soil"], log: null, method: "idw", cell: "", blank: "", busy: null, rasters: [], done: null, lastNote: "old note", calls: [] };
  const api = { setOpen: (o) => { st.open = !!o; }, setSymbol: (x) => { st.symbol = x; }, setMedium: (m) => { st.medium = m; }, setLogChoice: (v) => { st.log = v; }, setMethod: (m) => { st.method = m; }, setCell: (c) => { st.cell = c; }, setBlank: (b) => { st.blank = b; }, clearNote: () => { st.lastNote = ""; } };
  const button = { disabled: false, click() { onClick?.(st); } };
  return { st, button, g: () => ({ ...st, ...api }), doc: { querySelector: (q) => (q === '[data-mcp="sample-grid-run"]' ? button : null) } };
}
const sampleRun = (p, a) => sampleGridAction(p.g, a, { sleep, doc: p.doc, runMs: 3000, openStep: (id, k) => (p.st.steps ||= []).push([id, k]) });

test("grid_hole_values (surface): an element of one medium, the pane's own gridding; a refusal in its words; unknown element or medium listed", async () => {
  const p = samplePane({ onClick: (st) => { st.rasters = [{ id: "r_s", name: "Zn (ppm) soil IDW log10 100 m", grid: { nx: 40, ny: 30, dx: 100 } }]; st.done = { rows: [{ label: "Samples", value: "412" }] }; st.lastNote = "Gridded Zn (ppm) from 412 sample(s) (soil) at 100 m cells."; } });
  const r = await sampleRun(p, { source: "surface", value: "zn", medium: "SOIL", method: "natneigh", cell_m: 100, log: false });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.changed, r.ids, r.source, r.value, r.medium, r.method, r.cells], ["raster", ["r_s"], "surface", "Zn", "soil", "natneigh", "40 x 30"]);
  assert.deepEqual(r.result, { Samples: "412" }); assert.match(r.note, /^Gridded Zn/);
  assert.deepEqual(p.st.steps, [["geochem-grid", "how"]]);
  assert.deepEqual([p.st.open, p.st.symbol, p.st.medium, p.st.method, p.st.cell, p.st.log, p.st.lastNote === "" || p.st.lastNote.startsWith("Gridded")], [true, "Zn", "soil", "natneigh", "100", false, true]);
  const bad = await sampleRun(samplePane({ onClick: (st) => { st.lastNote = "Too few Zn values to grid (2): at least 3 samples with a value are needed."; } }), { source: "surface", value: "Zn" });
  assert.equal(bad.ok, false); assert.match(bad.error, /^Too few Zn values to grid/);
  assert.match((await sampleRun(samplePane(), { source: "surface", value: "Au" })).error, /No surface element 'Au'\. The elements: Cu, Zn/);
  assert.match((await sampleRun(samplePane(), { source: "surface", value: "Zn", medium: "stream" })).error, /No sampling medium 'stream'\. The media: rock chip, soil/);
  assert.match((await sampleRun(samplePane(), { source: "surface", value: "Zn", method: "spline" })).error, /'method' is 'idw'/);
});

// ---- the Multivariate anomaly score dialog
function mcdPane({ source = "surface", elements = ["Cu", "Zn", "Pb", "As"], pool = 30, existing = [], failWith = null } = {}) {
  const st = { source, medium: "\u0000all", ALL: "\u0000all", media: ["rock chip", "soil"], picked: null, name: "MCD_score", res: null, err: null, busy: false, wrote: null, hasAssays: true, hasSurface: true };
  const els = () => [...elements.map((s) => ({ symbol: s, unit: "ppm" })), ...existing.map((s) => ({ symbol: s, unit: "index", calculated: {} }))];
  const api = {
    setSource: (x) => { st.source = x; }, setPicked: (x) => { st.picked = x; }, reset: () => { st.res = null; st.err = null; }, setMedium: (m) => { st.medium = m; }, setName: (n) => { st.name = n; },
    run: () => { if (failWith) st.err = failWith; else st.res = { used: pool - 2, flagged: 3, cutoff: 3.0173, p: 3, scores: [] }; }, write: () => { st.wrote = st.name; },
  };
  const g = () => { const chosen = st.picked || elements.slice(0, 4); return { ...st, ...api, elements: els(), chosen, pool: Array.from({ length: pool }), validName: NAME(st.name) && !els().some((e) => e.symbol === st.name), top: [[{ sample_id: "S7" }, 9.3481], [{ hole_id: "DH-1", from: 2, to: 4 }, 7.2], [{ sample_id: "S2" }, 6.1], [{ sample_id: "S9" }, 5.5]], where: (r) => (r.hole_id != null ? `${r.hole_id} ${r.from}–${r.to} m` : r.sample_id) }; };
  return { st, g };
}
const NAME = (n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);
const mcdRun = (p, a) => anomalyAction(p.g, a, { sleep, runMs: 2000 });

test("anomaly_score: the dialog's choices go in, Score and Write the score are pressed, the numbers come back with the caution; a name in use is never replaced", async () => {
  const p = mcdPane();
  const r = await mcdRun(p, { source: "surface", medium: "soil", elements: ["cu", "Zn", "pb"], name: "Anom1" });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.changed, r.name, r.source, r.medium, r.samples_scored, r.of, r.elements, r.above_line, r.line], ["calculated element", "Anom1", "surface", "soil", 28, 30, ["Cu", "Zn", "Pb"], 3, 3.02]);
  assert.deepEqual(r.most_unusual, [{ sample: "S7", score: 9.35 }, { sample: "DH-1 2–4 m", score: 7.2 }, { sample: "S2", score: 6.1 }]);
  assert.match(r.note, /not a probability of mineralization/);
  assert.deepEqual([p.st.picked, p.st.medium, p.st.name, p.st.wrote], [["Cu", "Zn", "Pb"], "soil", "Anom1", "Anom1"]);
  // the default name when one is in use: a number is added; a named one in use is refused
  const q = mcdPane({ existing: ["MCD_score"] });
  assert.equal((await mcdRun(q, { source: "surface" })).name, "MCD_score_2");
  assert.match((await mcdRun(mcdPane({ existing: ["Anom1"] }), { source: "surface", name: "Anom1" })).error, /'Anom1' already exists as a column: GeoStrix does not replace it/);
  assert.match((await mcdRun(mcdPane(), { name: "1bad" })).error, /starts with a letter or underscore/);
  // 'all' types together
  const a = mcdPane({ source: "surface" }); a.st.medium = "soil";
  assert.equal((await mcdRun(a, { medium: "all" })).ok, true); assert.equal(a.st.medium, "\u0000all");
});

test("anomaly_score: refusals say what to give; the dialog's own error comes back; nothing is written when it fails", async () => {
  assert.match((await mcdRun(mcdPane(), { source: "xrf" })).error, /'source' is 'assays'/);
  assert.match((await mcdRun(mcdPane(), { medium: "stream" })).error, /No sampling type 'stream'\. The types: rock chip, soil \(or 'all'\)/);
  assert.match((await mcdRun(mcdPane({ source: "assays" }), { medium: "soil" })).error, /'medium' is for the surface samples/);
  assert.match((await mcdRun(mcdPane(), { elements: ["Cu", "Au"] })).error, /Not elements of these samples: Au\. The elements: Cu, Zn, Pb, As/);
  assert.match((await mcdRun(mcdPane(), { elements: ["Cu", "Zn"] })).error, /at least three elements; only Cu, Zn qualify/);
  assert.match((await mcdRun(mcdPane({ pool: 3 }), {})).error, /Only 3 sample\(s\) to score/);
  const f = mcdPane({ failWith: "Singular covariance." });
  assert.match((await mcdRun(f, { source: "surface" })).error, /^Singular covariance/); assert.equal(f.st.wrote, null);
  const none = mcdPane(); none.st.hasAssays = false;
  assert.match((await mcdRun(none, { source: "assays" })).error, /no drill assays to score/);
});

// ---- the module routes, as changes
function standIn(replyFor) {
  if (!globalThis.window) globalThis.window = new EventTarget();
  const on = (e) => { const { action, payload } = e.detail; const r = replyFor(action, payload); if (r) payload.reply(r); };
  window.addEventListener("geostrix-module-action", on);
  return () => window.removeEventListener("geostrix-module-action", on);
}
test("grid_hole_values and anomaly_score as changes: routed to Maps or Geochem, a short answer, the toast's Undo takes out exactly what was added (a surface column is in Ctrl+Z, the assays' is not)", async () => {
  const seen = [];
  const off = standIn((action, p) => {
    seen.push([action, p.value ?? p.source]);
    if (action === "mcp-grid-holes" || action === "mcp-sample-grid-run") return { ok: true, changed: "raster", name: "Zn grid", ids: ["rf"], cells: "10 x 10", result: { Samples: "412" } };
    if (action === "mcp-anomaly-score") return { ok: true, changed: "calculated element", name: "MCD_score", source: p.source || "surface", samples_scored: 28, above_line: 3, note: "x" };
    return null;
  });
  try {
    const store = (extra = {}) => { const s = { rasters: [{ id: "keep" }, { id: "rf" }], surfaceSamples: [{ id: "a", values: { Cu: 1, MCD_score: 2 } }], surfaceElements: [{ symbol: "Cu" }, { symbol: "MCD_score" }], assays: [{ id: "b", values: { Au: 1, MCD_score: 3 } }], assayElements: [{ symbol: "Au" }, { symbol: "MCD_score" }],
      undoCheckpoint() {}, goToModule: (t) => { s.tab = t; }, removeRaster: (id) => { s.rasters = s.rasters.filter((x) => x.id !== id); },
      setSurfaceSamples: (f) => { s.surfaceSamples = f(s.surfaceSamples); }, setSurfaceElements: (f) => { s.surfaceElements = f(s.surfaceElements); }, setAssays: (f) => { s.assays = f(s.assays); }, setAssayElements: (f) => { s.assayElements = f(s.assayElements); }, ...extra }; return s; };
    const go = async (tool, args, s) => { const toasts = []; const r = await runChange(tool, args, { getStore: () => s, client: "Claude Desktop", settle: async () => {}, toast: (t) => toasts.push(t) }); return [r, toasts]; };
    let s = store(), [r, t] = await go("grid_hole_values", { source: "holes", value: "Au" }, s);
    assert.equal(r.ok, true, r.error); assert.equal(s.tab, "maps"); assert.equal(seen.at(-1)[0], "mcp-grid-holes"); assert.equal(r.data.id, "rf");
    assert.match(t[0].message, /^Claude Desktop: added the raster 'Zn grid'$/); t[0].undo(); assert.deepEqual(s.rasters.map((x) => x.id), ["keep"]);
    s = store(); [r, t] = await go("grid_hole_values", { source: "surface", value: "Zn" }, s);
    assert.equal(s.tab, "geochem"); assert.equal(seen.at(-1)[0], "mcp-sample-grid-run");
    // the surface column: in the undo history; the toast's Undo takes the column out
    s = store(); [r, t] = await go("anomaly_score", { source: "surface" }, s);
    assert.equal(r.ok, true); assert.equal(s.tab, "geochem"); assert.equal(seen.at(-1)[0], "mcp-anomaly-score"); assert.match(t[0].message, /added the score column 'MCD_score'/);
    t[0].undo();
    assert.deepEqual(s.surfaceElements.map((e) => e.symbol), ["Cu"]); assert.deepEqual(s.surfaceSamples[0].values, { Cu: 1 }); assert.deepEqual(s.assayElements.map((e) => e.symbol), ["Au", "MCD_score"], "the assays are untouched");
    s = store(); [r, t] = await go("anomaly_score", { source: "assays" }, s); t[0].undo();
    assert.deepEqual(s.assayElements.map((e) => e.symbol), ["Au"]); assert.deepEqual(s.assays[0].values, { Au: 1 }); assert.deepEqual(s.surfaceElements.map((e) => e.symbol), ["Cu", "MCD_score"], "the surface samples are untouched");
    assert.ok(JSON.stringify(r.data).length < 400, "a short answer");
  } finally { off(); }
});

test("wiring: each pane carries its hook and the button mark the action presses; the routes; the schemas", () => {
  const hole = read("../src/components/HoleValueGridPanel.jsx"), sample = read("../src/components/SampleGridPanel.jsx"), mcd = read("../src/components/McdAnomalyPanel.jsx");
  assert.match(hole, /useMcpHoleGrid\(\(\) => \(\{ collars, open, setOpen, sources, source, setSourceId, setLogChoice, setCodes, stat: st, setStat, setThreshold, setPlaceAtChoice, setDepthAs, method, setMethod, setCell, setBlank, msg, setMsg, rasters, done, busy: false \}\)\);\s+if \(!collars\.length\) return null;/, "the hook runs before the pane's early return");
  assert.match(hole, /"data-mcp": "hole-grid-run"/);
  assert.match(sample, /useMcpSampleGrid\(\(\) => \(\{ surfaceSamples, surfaceElements, open, setOpen, symbol: el\?\.symbol,[^\n]*\}\)\);\s+if \(!surfaceSamples\.length \|\| !surfaceElements\.length\) return null;/);
  assert.match(sample, /"data-mcp": "sample-grid-run"/); assert.match(sample, /const setNotices = \(fn\) => \{ try \{ const next = typeof fn === "function" \? fn\(\[\]\) : fn;/);
  assert.match(mcd, /useMcpAnomaly\(\(\) => \(\{ source, setSource, setPicked, reset, media, ALL, medium, setMedium, elements, chosen, pool, name, setName, run, write, res, err, busy, validName, top, where, hasAssays: assays\.length > 0, hasSurface: surfaceSamples\.length > 0 \}\)\);/);
  assert.match(read("../src/modules/MapsModule.jsx"), /useModuleAction\(\["mcp-grid-holes"\],[^\n]*requestModuleAction\("mcp-hole-grid-run", p\);/);
  assert.match(read("../src/modules/GeochemModule.jsx"), /useModuleAction\(\["mcp-anomaly-score"\], \(_a, p\) => \{ setMcdOpen\(true\); requestModuleAction\("mcp-mcd-run", p\); \}\);/);
  for (const n of ["grid_hole_values", "anomaly_score"]) { assert.match(by[n].description, /^Makes a change in GeoStrix:/); assert.equal(by[n].annotations.openWorldHint, false, "no network"); assert.equal(by[n]._meta["geostrix/long"], true); }
  assert.deepEqual(by.grid_hole_values.inputSchema.required, ["source", "value"]); assert.deepEqual(by.grid_hole_values.inputSchema.properties.source.enum, ["holes", "surface"]);
  assert.deepEqual(by.grid_hole_values.inputSchema.properties.statistic.enum, ["max", "mean", "firstOver", "thick", "top", "base", "topRL", "baseRL"]);
  assert.deepEqual(Object.keys(by.anomaly_score.inputSchema.properties), ["source", "medium", "elements", "name"]);
});

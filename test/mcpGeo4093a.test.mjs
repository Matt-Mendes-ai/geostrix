// TASKS.csv #4093 (AI app access, batch 5, piece A) — list_rasters_surveys and suggest_thresholds (read-only) and set_threshold (a change): what an AI app can read about the
// rasters / point surveys / surface samples / saved thresholds, the Thresholds pane's candidate rules, and saving one as the anomaly threshold without replacing a saved one.
// Every project here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runTool } from "../src/lib/mcpTools.js";
import { runChange, ACTIONS } from "../src/lib/mcpActions.js";
import { populations, candidateThresholds, THRESHOLD_METHODS } from "../src/lib/thresholds.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const defs = JSON.parse(read("../electron/mcpToolDefs.json"));
const by = Object.fromEntries(defs.map((d) => [d.name, d]));

// 30 soils and 14 rock chips of one element (log-normal-ish), two below the detection limit
const soil = Array.from({ length: 30 }, (_, i) => ({ id: `S${i}`, medium: "soil", x: 1000 + i * 25, y: 2000, values: { Cu: 18 * Math.exp(0.09 * i) + (i % 7) }, bdl: i < 2 ? ["Cu"] : undefined }));
const rock = Array.from({ length: 14 }, (_, i) => ({ id: `R${i}`, medium: "rock chip", x: 1500 + i * 10, y: 2100, values: { Cu: 200 * Math.exp(0.15 * i) } }));
function project(extra = {}) {
  const s = {
    project: { name: "Test", epsg: 26909, crsSet: true }, collars: [{ hole_id: "DH-1", x: 1000, y: 2000, z: 300 }], survey: [], layers: { geophys_pts: [
      { x: 1, y: 1, value: 5, _src: "mag.csv" }, { x: 2, y: 1, value: 6, _src: "mag.csv" }, { x: 3, y: 1, value: 7, _src: "grav.csv" }] },
    assays: [[0, 2, 0.2], [2, 4, 0.4], [4, 6, 1.1], [6, 8, 0.3], [8, 10, 0.25], [10, 12, 0.5], [12, 14, 0.15], [14, 16, 0.2], [16, 18, 0.35], [18, 20, 0.45], [20, 22, 3.2], [22, 24, 0.3]].map(([from, to, Au]) => ({ hole_id: "DH-1", from, to, values: { Au } })),
    assayElements: [{ symbol: "Au", unit: "ppm" }], surfaceElements: [{ symbol: "Cu", unit: "ppm" }], surfaceSamples: [...soil, ...rock], mapLayers: [],
    geophysSurveys: { "mag.csv": { method: "mag", units: "nT" }, "grav.csv": { method: "grav", units: "mGal" } },
    rasters: [{ id: "raster_1", name: "Mag TMI", grid: { nx: 120, ny: 80, dx: 25 }, units: "nT", surveyMethod: "mag", visible: true, provenance: { tool: "Point survey gridding (IDW)" } },
      { id: "raster_2", name: "Satellite", visible: false }],
    geochemThresholds: [], codeDictionary: {}, ...extra,
  };
  s.undoCheckpoint = () => {}; s.setGeochemThresholds = (fn) => { s.geochemThresholds = typeof fn === "function" ? fn(s.geochemThresholds) : fn; };
  return s;
}

test("list_rasters_surveys: the grids and pictures, the point surveys with their method, the samples, the saved thresholds", () => {
  const s = project({ geochemThresholds: [{ symbol: "Cu", method: "p95", methodLabel: "95th percentile", decided: "2026-11-25" }] });
  const r = runTool("list_rasters_surveys", {}, s);
  assert.equal(r.ok, true);
  const d = r.data;
  assert.deepEqual(d.rasters.map((x) => [x.id, x.kind]), [["raster_1", "grid"], ["raster_2", "picture"]]);
  assert.deepEqual([d.rasters[0].method, d.rasters[0].unit, d.rasters[0].cells, d.rasters[0].cell_m, d.rasters[0].made_by], ["Magnetics (TMI)", "nT", "120 x 80", 25, "Point survey gridding (IDW)"]);
  assert.equal(d.rasters[1].visible, false);
  assert.deepEqual(d.point_surveys.map((x) => [x.name, x.points, x.method]), [["mag.csv", 2, "Magnetics (TMI)"], ["grav.csv", 1, "Gravity (Bouguer)"]]);
  assert.equal(d.surface_samples.n, 44); assert.deepEqual(d.surface_samples.media, ["soil", "rock chip"]); assert.deepEqual(d.surface_samples.elements, [{ symbol: "Cu", unit: "ppm" }]);
  assert.deepEqual(d.thresholds, [{ element: "Cu", source: "surface", rule: "95th percentile", decided: "2026-11-25" }]);
  // an empty project answers empty lists, not an error
  const e = runTool("list_rasters_surveys", {}, { collars: [] });
  assert.equal(e.ok, true); assert.deepEqual([e.data.rasters, e.data.point_surveys, e.data.thresholds], [[], [], []]);
});

test("suggest_thresholds: the pane's populations and rule values, the rules a population cannot reach, the default rule, the saved one; candidates, not facts", () => {
  const s = project();
  const r = runTool("suggest_thresholds", { element: "Cu" }, s);
  assert.equal(r.ok, true, r.error);
  const d = r.data;
  assert.equal(d.element, "Cu"); assert.equal(d.source, "surface"); assert.equal(d.unit, "ppm"); assert.equal(d.populations_by, "Sampling medium");
  assert.deepEqual(d.populations.map((p) => p.population).sort(), ["rock chip", "soil"]);
  // the values are the library's, population by population (the same maths as the pane)
  const soilPop = populations(soil, { valueOf: (x) => x.values.Cu, censoredOf: (x) => !!x.bdl, keyOf: () => "soil" })[0];
  const cand = candidateThresholds(soilPop.summary);
  const out = d.populations.find((p) => p.population === "soil");
  assert.equal(out.n, soilPop.summary.n);
  for (const id of ["p90", "p95", "median2mad"]) assert.ok(Math.abs(out.rules[id] - cand.values[id]) <= Math.abs(cand.values[id]) * 1e-3, id);
  assert.equal(d.scale, "log"); assert.ok(d.rules.some((x) => x.id === "median2mad") && !d.rules.some((x) => x.id === "amean2sd"), "the log rules on log axes, as the pane");
  assert.ok(d.rules.every((x) => x.assumption && Array.isArray(x.cannot_reach)));
  assert.match(d.reminder, /candidate rules from your data, not facts/);
  assert.equal(d.saved, null);
  // drill assays: one population, length-weighted
  const dr = runTool("suggest_thresholds", { element: "Au", source: "drill" }, s);
  assert.equal(dr.ok, true, dr.error); assert.equal(dr.data.source, "drill"); assert.deepEqual(dr.data.populations.map((p) => p.population), ["All"]);
  // an element only the assays hold is found without 'source'
  assert.equal(runTool("suggest_thresholds", { element: "au" }, s).data.source, "drill");
  // errors are plain
  assert.match(runTool("suggest_thresholds", { element: "Zz" }, s).error, /No element 'Zz'/);
  assert.match(runTool("suggest_thresholds", { element: "Cu", source: "drill" }, s).error, /No element 'Cu' in the drill assays/);
  assert.match(runTool("suggest_thresholds", { element: "" }, s).error, /Give the element/);
  assert.equal(runTool("suggest_thresholds", { element: "Cu" }, { ...s, surfaceSamples: [] }).ok, false);
});

test("set_threshold: saves the pane's record, one Undo, nothing replaced", async () => {
  const s = project();
  const toasts = [];
  const r = await runChange("set_threshold", { element: "Cu", rule: "p95" }, { getStore: () => s, client: "Claude Desktop", settle: async () => {}, toast: (t) => toasts.push(t) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.changed, "anomaly threshold"); assert.equal(r.data.rule, "p95"); assert.equal(r.data.element, "Cu");
  assert.deepEqual(r.data.populations.map((p) => p.population).sort(), ["rock chip", "soil"]);
  const rec = s.geochemThresholds.at(-1);
  // the record the pane's Save writes
  assert.deepEqual(Object.keys(rec).sort(), ["censoredPct", "decided", "groupBy", "groupLabel", "method", "methodLabel", "n", "ref", "symbol", "unit", "values"].sort());
  assert.deepEqual([rec.symbol, rec.unit, rec.groupBy, rec.groupLabel, rec.method, rec.methodLabel], ["Cu", "ppm", "medium", "Sampling medium", "p95", "95th percentile"]);
  assert.deepEqual(Object.keys(rec.values).sort(), ["rock chip", "soil"]); assert.ok(rec.values.soil > 0 && rec.values["rock chip"] > rec.values.soil);
  assert.match(rec.decided, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(toasts[0].message, /Claude Desktop: saved Cu's 95th percentile threshold/);
  assert.equal(typeof toasts[0].undo, "function");
  // its Undo takes out exactly that record
  s.geochemThresholds = [{ symbol: "Zn", method: "p95", decided: "2026-01-01" }, ...s.geochemThresholds];
  toasts[0].undo();
  assert.deepEqual(s.geochemThresholds.map((x) => x.symbol), ["Zn"]);
});

test("set_threshold: a saved rule is never replaced; an unknown, wrong-scale or unreachable rule is refused with the reason", async () => {
  const run = (a, extra) => { const s = project(extra); return runChange("set_threshold", a, { getStore: () => s, client: "x", settle: async () => {}, toast: () => {} }).then((r) => [r, s]); };
  let [r, s] = await run({ element: "Cu", rule: "p95" }, { geochemThresholds: [{ symbol: "Cu", method: "p90", methodLabel: "90th percentile", decided: "2026-11-01" }] });
  assert.equal(r.ok, false); assert.match(r.error, /already saved \(90th percentile, decided 2026-11-01\)\. GeoStrix does not replace it/); assert.equal(s.geochemThresholds.length, 1);
  // the drill rule of the same element is a separate record
  [r, s] = await run({ element: "Au", rule: "p95", source: "drill" }, { geochemThresholds: [{ symbol: "Au", method: "p90", methodLabel: "90th percentile", decided: "2026-11-01" }] });
  assert.equal(r.ok, true, r.error); assert.equal(s.geochemThresholds.at(-1).source, "drill"); assert.equal(s.geochemThresholds.at(-1).weighting, "length");
  [r] = await run({ element: "Cu", rule: "nope" }); assert.match(r.error, /Unknown rule 'nope'.*median2mad/);
  [r] = await run({ element: "Cu", rule: "amean2sd" }); assert.match(r.error, /does not apply to Cu here: it reads on log axes/);
  [r] = await run({ element: "Zz", rule: "p95" }); assert.match(r.error, /No element 'Zz'/);
});

test("the three tools are in the schemas and wired: reads say Read-only, the change says Makes a change; the snapshot carries what they read", () => {
  for (const n of ["list_rasters_surveys", "suggest_thresholds"]) assert.match(by[n].description, /^Read-only\./, n);
  assert.match(by.set_threshold.description, /^Makes a change in GeoStrix:/);
  assert.equal(by.set_threshold.annotations.readOnlyHint, false); assert.equal(by.set_threshold.annotations.openWorldHint, false); assert.equal(by.set_threshold._meta, undefined, "instant, not long");
  assert.deepEqual(by.set_threshold.inputSchema.required, ["element", "rule"]); assert.deepEqual(by.suggest_thresholds.inputSchema.properties.source.enum, ["surface", "drill"]);
  assert.ok(Object.prototype.hasOwnProperty.call(ACTIONS, "set_threshold"));
  assert.match(read("../src/App.jsx"), /rasters: s\.rasters, geophysSurveys: s\.geophysSurveys, surfaceSamples: s\.surfaceSamples, surfaceElements: s\.surfaceElements, geochemThresholds: s\.geochemThresholds/);
  // every rule id the schema example names exists
  assert.ok(THRESHOLD_METHODS.some((m) => m.id === "median2mad") && THRESHOLD_METHODS.some((m) => m.id === "p95"));
});

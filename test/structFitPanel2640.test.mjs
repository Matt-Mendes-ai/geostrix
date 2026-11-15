// TASKS.csv #2640 Stage 1 — the panel's side of "which contacts can this survey see?": the request built from the last model run
// (store.lastImplicitRequest) in the engine's frame, drillhole points never offered, trend-warped models refused, every value the user must
// state refused when missing, and the engine's answer as table rows. SYNTHETIC records only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { movableSurfaces, propertyUnits, modelProblem, buildStructfitRequest, everyNth, resultRows } from "../src/lib/structFit.js";

const O = { x: 540000, y: 4930000, z: 1000 };
const pts = (z0, n, holes = 0) => Array.from({ length: n }, (_, i) => ({ x: O.x + 300 + i * 150, y: O.y + 500, z: O.z + z0 - i * 5, hole_id: i < holes ? `DDH-${i}` : null, nugget: i === 2 ? 0.01 : null }));
const record = () => ({
  at: "2026-11-14T00:00:00Z", tool: "Stack model", trendFrame: false, origin: O, extent: [0, 2000, 0, 2000, -1000, 0], resolution: [24, 24, 24],
  surfaces: [
    { name: "top_B", fault: false, points: pts(-200, 6, 2), orientations: [{ x: O.x + 1000, y: O.y + 1000, z: O.z - 200, dip: 10, azimuth: 90 }] },
    { name: "F1", fault: true, points: pts(-300, 3), orientations: [{ x: O.x + 800, y: O.y + 900, z: O.z - 300, dip: 80, azimuth: 45 }] },
    { name: "top_C", fault: false, points: pts(-800, 5), orientations: [{ x: O.x + 1000, y: O.y + 1000, z: O.z - 800, dip: 5, azimuth: 90 }] },
  ],
});
const stations = [[O.x + 100, O.y + 100, O.z + 30], [O.x + 900, O.y + 600, O.z + 32], [O.x + 1800, O.y + 1700, O.z + 31]];

test("#2640 the surfaces and points offered: faults and drillhole contacts are not", () => {
  const s = movableSurfaces(record());
  assert.deepEqual(s.map((x) => [x.name, x.unit]), [["top_B", 2], ["top_C", 3]]); // unit ids as the engine numbers them: 1 is the background above every top
  assert.deepEqual(s[0].points.map((p) => p.index), [2, 3, 4, 5]); // points 0 and 1 are from holes
  assert.equal(s[0].fromHoles, 2); assert.equal(s[1].fromHoles, 0);
  assert.deepEqual(propertyUnits(record()), [{ id: 1, label: null }, { id: 2, label: "top_B" }, { id: 3, label: "top_C" }]);
});

test("#2640 what cannot be tested says why: no run, a trend frame, only drillhole points", () => {
  assert.match(modelProblem(null), /Run a geology model in 3D Modelling first/);
  assert.match(modelProblem({ ...record(), trendFrame: true }), /structural trend, in a warped frame/);
  assert.match(modelProblem({ ...record(), surfaces: [{ name: "a", fault: false, points: pts(-1, 3, 3), orientations: [] }] }), /drillhole contact/);
  assert.equal(modelProblem(record()), null);
});

test("#2640 the request: the run's frame (project less origin), faults apart, nuggets kept, a property for every unit, the distance typed", () => {
  const b = buildStructfitRequest({ record: record(), method: "grav", stations, observed: [1, 2, 3], uncertainty: { floor: "0.05", percent: "" },
    props: { 1: "2.67", 2: "2.9", 3: "3.1" }, movable: [{ surface: "top_B", index: 3 }], maxM: "100" });
  assert.equal(b.problems, undefined);
  const r = b.request;
  assert.deepEqual(r.model.extent, [0, 2000, 0, 2000, -1000, 0]); assert.equal(r.model.relation, "erode");
  assert.deepEqual(r.model.surfaces.map((s) => s.name), ["top_B", "top_C"]); assert.deepEqual(r.model.faults.map((s) => s.name), ["F1"]);
  assert.deepEqual(r.model.surfaces[0].points[3], { x: 300 + 3 * 150, y: 500, z: -200 - 15, hole_id: null });
  assert.equal(r.model.surfaces[0].points[0].hole_id, "DDH-0"); // sent, so the engine can refuse to move it
  assert.equal(r.model.surfaces[0].points[2].nugget, 0.01);
  assert.deepEqual(r.model.surfaces[0].orientations[0], { x: 1000, y: 1000, z: -200, dip: 10, azimuth: 90 });
  assert.deepEqual(r.stations[1], [900, 600, 32]);
  assert.deepEqual(r.properties, { 1: 2.67, 2: 2.9, 3: 3.1 }); assert.deepEqual(r.uncertainty, { floor: 0.05, percent: 0 });
  assert.deepEqual(r.movable, [{ surface: "top_B", index: 3, maxM: 100 }]); assert.equal(r.method, "grav"); assert.equal(r.field, undefined);
  assert.deepEqual(r.observed, [1, 2, 3]); assert.equal(r.resolve, undefined);
  // magnetics carries its field; a re-solve its bounds
  const m = buildStructfitRequest({ record: record(), method: "mag", stations, observed: [1, 2, 3], uncertainty: { floor: 1, percent: 2 }, field: { strength: 57000, inclination: 70, declination: 15 },
    props: { 1: 0, 2: 0.01, 3: 0.02 }, movable: [{ surface: "top_C", index: 0 }], maxM: 50, resolve: { 1: [0, 0.001], 2: [0, 0.1], 3: [0, 0.1] } });
  assert.deepEqual(m.request.field, { strength: 57000, inclination: 70, declination: 15 }); assert.deepEqual(m.request.resolve, { 2: [0, 0.1], 3: [0, 0.1] }); // the background is the reference: no bounds sent assert.equal(m.request.uncertainty.percent, 2);
});

test("#2640 nothing is assumed: every value the user must state is refused when missing", () => {
  const base = { record: record(), method: "grav", stations, observed: [1, 2, 3], uncertainty: { floor: 0.05 }, props: { 1: 2.67, 2: 2.9, 3: 3.1 }, movable: [{ surface: "top_B", index: 3 }], maxM: 100 };
  const bad = (patch) => buildStructfitRequest({ ...base, ...patch }).problems?.join(" ");
  assert.match(bad({ uncertainty: {} }), /uncertainty floor/); assert.match(bad({ maxM: "" }), /distance each point may move/);
  assert.match(bad({ movable: [] }), /Mark the points/); assert.match(bad({ props: { 1: 2.67, 2: 2.9 } }), /every unit, the background included/);
  assert.match(bad({ props: {} }), /each unit's density or susceptibility/); assert.match(bad({ props: { 1: 2.67, 2: 9, 3: 3.1 } }), /g\/cm³ \(between 1 and 6\)/);
  assert.match(bad({ method: "" }), /Choose magnetics or gravity/); assert.match(bad({ stations: [] }), /no usable stations/);
  assert.match(bad({ resolve: { 2: [4, 3], 3: [3, 4] } }), /lowest and highest value/); assert.match(bad({ resolve: { 2: [3, 4], 3: [3, 4] }, observed: null }), /survey's readings/);
  assert.match(bad({ record: { ...record(), trendFrame: true } }), /warped frame/);
});

test("#2640 helpers: points spread over a surface, the engine's answer as rows in project coordinates", () => {
  const p = movableSurfaces(record())[0].points;
  assert.deepEqual(everyNth(p, "top_B", 2), [{ surface: "top_B", index: 2 }, { surface: "top_B", index: 4 }]); assert.deepEqual(everyNth([], "x"), []);
  const many = Array.from({ length: 100 }, (_, i) => ({ index: i })); const sp = everyNth(many, "s", 20);
  assert.equal(sp.length, 20); assert.equal(sp[0].index, 0); assert.ok(sp[19].index >= 90);
  const rows = resultRows({ points: [{ surface: "top_B", index: 3, x: 450, y: 500, z: -215, maxM: 100, stepM: 10, rmsPerM: 0.028, shiftForOneSigma: 35.7, seen: true, bandCells: 1180 },
    { surface: "top_C", index: 0, x: 300, y: 500, z: -800, maxM: 100, stepM: 10, rmsPerM: 0.0006, shiftForOneSigma: 1536, seen: false, bandCells: 400 }, { surface: "top_C", index: 1, x: 1, y: 1, z: 1, rmsPerM: 0, shiftForOneSigma: null, seen: false, note: "no contact of two units here" }] }, record());
  assert.deepEqual(rows.map((r) => r.verdict), ["seen", "not constrained", "none"]); assert.deepEqual([rows[0].x, rows[0].y, rows[0].z], [O.x + 450, O.y + 500, O.z - 215]);
});

test("#2640 the pane: a lazy section that reads the last run, vertical moves said, the engine job started", () => {
  const ip = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(ip, /const StructFitPanel = React\.lazy\(\(\) => import\("\.\/StructFitPanel\.jsx"\)\);/);
  assert.match(ip, /<StructFitPanel method=\{method\} unit=\{M\?\.unit \|\| ""\} keptScope=\{keptScope\} prepareForward=\{\(\) => prepare\("structfit"\)\}/);
  assert.match(ip, /if \(kind !== "structfit" && !\(num\(mesh\.coreCell\) >= 1\)\)/); // the model's own grid: no mesh to size
  const sp = readFileSync(new URL("../src/components/StructFitPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(sp, /const \{ lastImplicitRequest: record, setLayers, updateGeophysSurvey \} = useStore\(\);/);
  assert.match(sp, /runStructfitJob\(built\.request, \{ signal: ctl\.signal/);
  assert.match(sp, /Points move vertically only\. Points from drillhole contacts are observations and never move\./);
  assert.match(sp, /never the answer\./);
});

test("#3632 the tested points as a geophysics point survey: log10 sensitivity as the value, the verdict as a column, no-contact points left out", async () => {
  const { verdictPoints } = await import("../src/lib/structFit.js");
  const rows = [
    { surface: "top_B", index: 4, x: 540010.123, y: 4930020.456, z: 950.5, rmsPerM: 0.0286, shiftForOneSigma: 35.04, verdict: "seen" },
    { surface: "top_C", index: 4, x: 540100, y: 4930100, z: 900, rmsPerM: 0.0007, shiftForOneSigma: 1508, verdict: "not constrained" },
    { surface: "top_B", index: 5, x: 1, y: 2, z: 3, rmsPerM: 0, shiftForOneSigma: null, verdict: "none" },
    { surface: "top_B", index: 6, x: NaN, y: 2, z: 3, rmsPerM: 0.1, shiftForOneSigma: 5, verdict: "seen" },
  ];
  const pts = verdictPoints(rows, "Gravity · contact sensitivity");
  assert.equal(pts.length, 2);
  assert.deepEqual(pts[0], { x: 540010.12, y: 4930020.46, z: 950.5, value: -1.544, surface: "top_B", point: 5, verdict: "seen", shift_for_one_sigma_m: 35.04, _src: "Gravity · contact sensitivity" });
  assert.equal(pts[1].value, -3.155); assert.equal(pts[1].verdict, "not constrained");
  assert.deepEqual(verdictPoints(null, "x"), []);
  const p = readFileSync(new URL("../src/components/StructFitPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /updateGeophysSurvey\(name, \{ method: "structfit_sens", units: SURVEY_METHODS\.structfit_sens\.units \}\)/);
  assert.match(p, /tr\("Show the tested points in the 3D View"\)/);
});

test("#3632 the 3D View's own point-survey builder draws the verdict points, warm for the seen contact and cool for the unconstrained one, with a tooltip", async () => {
  const THREE = await import("three");
  const { syncGeophysPts, geophysTipText } = await import("../src/lib/viewer/geophysPts.js");
  const { verdictPoints } = await import("../src/lib/structFit.js");
  const name = "Gravity · contact sensitivity";
  const rows = verdictPoints([
    { surface: "top_B", index: 0, x: 540010, y: 4930020, z: 950, rmsPerM: 0.3, shiftForOneSigma: 3, verdict: "seen" },
    { surface: "top_B", index: 1, x: 540110, y: 4930020, z: 940, rmsPerM: 0.001, shiftForOneSigma: 900, verdict: "not constrained" },
    { surface: "top_C", index: 0, x: 540210, y: 4930020, z: 900, rmsPerM: 0.02, shiftForOneSigma: 40, verdict: "seen" },
  ], name);
  const surveys = { [name]: { method: "structfit_sens", units: "log₁₀ σ per m" } };
  const g = new THREE.Group(), tips = [];
  const out = syncGeophysPts(g, rows, { opts: {}, surveys, style: { color: null, opacity: 1, size: 1, shape: "sphere" }, proto: new THREE.SphereGeometry(1, 8, 6), minR: 0.5, origin: { x: 540000, y: 4930000, z: 0 }, tipOf: (row) => { tips.push(geophysTipText(row, surveys)); return tips[tips.length - 1]; } });
  assert.deepEqual(out.rebuilt, [name]);
  const inst = g.children.find((c) => c.userData.geophysSurvey === name);
  assert.equal(inst.count, 3);
  const c = inst.instanceColor.array, lum = (i) => c[i * 3] + c[i * 3 + 1] + c[i * 3 + 2];
  assert.notDeepEqual([c[0], c[1], c[2]], [c[3], c[4], c[5]], "the seen and the unconstrained contact differ in colour");
  assert.ok(Math.abs(lum(0) - lum(1)) > 0.05);
  assert.match(geophysTipText(rows[0], surveys), /Gravity · contact sensitivity\n.*log₁₀ σ per m/s);
});

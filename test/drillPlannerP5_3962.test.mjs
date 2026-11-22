// TASKS.csv #3962 P5 — the drill planner's AI-app tools (design.md 4.2): four reads, three changes behind the switch, each change one Undo step,
// the long one answering 'started' past 20 s (the protocol's, #3937), and the cautions in every answer. A synthetic drilled field only.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runChange } from "../src/lib/mcpActions.js";
import { runTool } from "../src/lib/mcpTools.js";
import { PLANNER_CAUTIONS } from "../src/lib/drillPlanner/mcpPlanner.js";
import { normalStream, cholesky } from "../src/lib/drillPlanner/gaussian.js";
import { variogramModelValue } from "../src/lib/variogram.js";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const NAMES = { read: ["list_drill_programs", "get_drill_program", "explain_hole", "predict_hole"], change: ["run_drill_planner", "add_program_holes", "set_planned_hole_status"] };

// 20 straight holes on a 50 m grid, 3 m assays from a Gaussian field (spherical, range 60 m), lognormal grades
function field() {
  const VG = { model: "spherical", nugget: 0.1, sill: 1, range: 60 }, cov = (h) => (h <= 1e-9 ? 1 : 1 - variogramModelValue(h, VG));
  const collars = [], pts = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
    const c = { hole_id: `FX-${String(i * 4 + j + 1).padStart(3, "0")}`, x: i * 50, y: j * 50, z: 500, azimuth: 90, dip: -75, length: 90 };
    collars.push(c);
    const dx = Math.sin(15 * Math.PI / 180), dz = -Math.cos(15 * Math.PI / 180);
    for (let k = 0; k < 30; k++) pts.push({ hole_id: c.hole_id, from: k * 3, to: k * 3 + 3, x: c.x + (k * 3 + 1.5) * dx, y: c.y, z: c.z + (k * 3 + 1.5) * dz });
  }
  const n = pts.length, K = new Float64Array(n * n);
  for (let a = 0; a < n; a++) for (let b = a; b < n; b++) { const c = cov(Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y, pts[a].z - pts[b].z)); K[a * n + b] = c; K[b * n + a] = c; }
  const { L } = cholesky(K, n, 1e-9), e = normalStream(7), w = Float64Array.from({ length: n }, () => e());
  const assays = pts.map((p, a) => { let s = 0; for (let k = 0; k <= a; k++) s += L[a * n + k] * w[k]; return { hole_id: p.hole_id, from: p.from, to: p.to, values: { Au: Number(Math.exp(0.2 + 0.9 * s).toFixed(3)) } }; });
  return { collars, assays };
}
// a store with the functions the actions call
function store() {
  const { collars, assays } = field();
  const s = { collars, survey: [], desurveyMethod: "tangent", assays, assayElements: [{ symbol: "Au", unit: "g/t" }], voxelModels: [], plannedHoles: [], project: { drillRates: { "": 150 }, drillPrograms: [] }, checkpoints: [] };
  s.setDrillPrograms = (f) => { s.project = { ...s.project, drillPrograms: typeof f === "function" ? f(s.project.drillPrograms || []) : f }; };
  s.addPlannedHole = (h) => { const id = `plan_${s.plannedHoles.length + 1}`; s.plannedHoles = [...s.plannedHoles, { ...h, id }]; return id; };
  s.updatePlannedHole = (id, patch) => { s.plannedHoles = s.plannedHoles.map((h) => (h.id === id ? { ...h, ...patch } : h)); };
  s.undoCheckpoint = (label) => s.checkpoints.push(label ?? null);
  return s;
}
const call = (s, name, args) => runChange(name, args, { getStore: () => s, client: "Claude Desktop", settle: async () => {} });
const read = async (s, name, args) => { const r = await runTool(name, args, s); assert.equal(r.ok, true, `${name}: ${r.error}`); return r.data; };
const cautioned = (d) => assert.deepEqual(d.cautions, PLANNER_CAUTIONS);

test("the schemas: four reads and three changes, the changes behind the switch with 'Makes a change', run_drill_planner long, strict arguments", () => {
  const def = (n) => proto.TOOLS.find((t) => t.name === n);
  for (const n of NAMES.read) { assert.ok(def(n), n); assert.equal(proto.isChangeTool(def(n)), false, n); assert.match(def(n).description, /^Read-only\./); }
  for (const n of NAMES.change) { assert.ok(def(n), n); assert.equal(proto.isChangeTool(def(n)), true, n); assert.match(def(n).description, /^Makes a change in GeoStrix:/); assert.equal(def(n).annotations.destructiveHint, false); }
  assert.equal(proto.isLongTool(def("run_drill_planner")), true);
  assert.equal(proto.isLongTool(def("add_program_holes")), false);
  for (const n of [...NAMES.read, ...NAMES.change]) assert.equal(def(n).inputSchema.additionalProperties, false, n);
  assert.match(def("run_drill_planner").description, /not a resource estimate/);
  assert.match(def("set_planned_hole_status").description, /Never drilled/);
});

test("run_drill_planner: a suggested program saved (no hole added), one Undo step, a short answer; get_drill_program gives the holes, reasons, predictions and the cautions", async () => {
  const s = store();
  const r = await call(s, "run_drill_planner", { element: "Au", max_holes: 4, azimuth_step: 90, dips: [-60, -75], max_length: 150, accept_weak_fit: true });
  assert.equal(r.ok, true, r.error);
  assert.equal(s.plannedHoles.length, 0, "no hole added");
  assert.equal(s.project.drillPrograms.length, 1);
  const p = s.project.drillPrograms[0];
  assert.equal(p.scenario, true); assert.equal(p.by, "Claude Desktop");
  assert.ok(r.data.program_id === p.id && r.data.holes >= 1 && r.data.holes <= 4);
  assert.ok(JSON.stringify(r.data).length < 400, "a short answer");
  assert.match(r.data.next, /not a resource estimate/);
  assert.deepEqual(s.checkpoints.length, 2, "one step: a checkpoint before and one after");
  assert.match(s.checkpoints[1], /Claude Desktop: suggested a drill program/);
  const g = await read(s, "get_drill_program", { program_id: p.id });
  cautioned(g);
  assert.equal(g.added, false);
  assert.equal(g.holes.length, r.data.holes);
  for (const h of g.holes) { assert.ok(h.why && /m from FX-\d{3}|Far from the drilling/.test(h.why), h.why); assert.ok(h.prediction && (h.prediction.beyond_the_drilling || h.prediction.grade_x_metres.middle_p50 != null)); }
  const l = await read(s, "list_drill_programs", {});
  cautioned(l);
  assert.deepEqual([l.programs[0].added, l.programs[0].new_data_since, l.programs[0].suggested_by], [false, false, "Claude Desktop"]);
  s.assays = [...s.assays, { hole_id: "FX-001", from: 90, to: 93, values: { Au: 1 } }];
  assert.equal((await read(s, "list_drill_programs", {})).programs[0].new_data_since, true, "new assays since");
});

test("add_program_holes: proposed planned holes named by the project's series, each with its prediction; once only. set_planned_hole_status: never drilled", async () => {
  const s = store();
  const pid = (await call(s, "run_drill_planner", { max_holes: 3, azimuth_step: 90, dips: [-60], max_length: 150, accept_weak_fit: true })).data.program_id;
  const r = await call(s, "add_program_holes", { program_id: pid, holes: "all" });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(s.plannedHoles.map((h) => h.name), r.data.holes.map((h) => h.name));
  assert.equal(s.plannedHoles[0].name, "FX-021", "the next id of the project's series");
  for (const h of s.plannedHoles) { assert.equal(h.status, "proposed"); assert.equal(h.programId, pid); assert.ok(h.prediction?.v === 1); assert.match(h.notes, /^Suggested by the drill program \(balanced, #\d+, via Claude Desktop\): /); }
  assert.match((await call(s, "add_program_holes", { program_id: pid })).error, /already added/);
  assert.equal((await read(s, "list_drill_programs", {})).programs[0].added, true);
  // one Undo takes the holes back (the program is a project field outside the history): it is then not added, and can be added again
  s.plannedHoles = [];
  assert.equal((await read(s, "list_drill_programs", {})).programs[0].added, false);
  assert.equal((await call(s, "add_program_holes", { program_id: pid, holes: "1,2" })).ok, true, "added again");
  assert.equal(s.plannedHoles.length, 2);
  s.plannedHoles = s.plannedHoles.slice(0, 0); await call(s, "add_program_holes", { program_id: pid });
  const name = s.plannedHoles[0].name;
  assert.equal((await call(s, "set_planned_hole_status", { hole: name, status: "approved" })).ok, true);
  assert.equal(s.plannedHoles[0].status, "approved");
  assert.match((await call(s, "set_planned_hole_status", { hole: name, status: "drilled" })).error, /proposed' or 'approved'/);
  s.updatePlannedHole(s.plannedHoles[0].id, { asDrilledHoleId: "FX-099" });
  assert.match((await call(s, "set_planned_hole_status", { hole: name, status: "proposed" })).error, /is drilled/);
  const e = await read(s, "explain_hole", { hole: s.plannedHoles[1].name });
  cautioned(e);
  assert.ok(e.reason && e.nearest_drilled_collar?.hole_id.startsWith("FX-") && e.prediction && e.prediction_state === "current");
});

test("predict_hole: a planned hole or a collar, computed and kept nowhere; bad input refused with what to give", async () => {
  const s = store();
  const t0 = Date.now();
  const d = await read(s, "predict_hole", { collar: { easting: 75, northing: 75, elevation: 500 }, azimuth: 45, dip: -60, length: 120, cutoff: 1.5 });
  cautioned(d);
  assert.ok(d.prediction.chance_of_an_intercept >= 0 && d.prediction.grade_x_metres.low_p10 <= d.prediction.grade_x_metres.high_p90);
  assert.equal(d.prediction.cutoff, 1.5);
  assert.ok(d.model.composites > 100 && /fitted now/.test(d.model.settings_from));
  assert.ok(Date.now() - t0 < 20000, "well inside a read's 30 s");
  assert.equal(s.plannedHoles.length, 0); assert.equal(s.project.drillPrograms.length, 0);
  const bad = await runTool("predict_hole", { collar: { easting: 1, northing: 2, elevation: 3 }, azimuth: 0, dip: 10, length: 50 }, s);
  assert.equal(bad.ok, false); assert.match(bad.error, /negative for a hole pointing down/);
  const none = await runTool("explain_hole", { hole: "nope" }, s);
  assert.match(none.error, /No planned hole 'nope'/);
});

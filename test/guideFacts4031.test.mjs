// TASKS.csv #4031 (guided modelling row 1) — the guide's facts, steps and route on synthetic projects: a layered pile, four holes only, a repeated
// (folded) order, a map only, assays only, a cover, a rock that cuts the others, faults and a vein; the one-pass read of a 200,000-row log and
// the memo; and that none of the three files reaches three.js, the model runs, the desurvey or the desktop bridge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guideFacts, clearGuideFacts } from "../src/lib/guide/guideFacts.js";
import { suggestRoute } from "../src/lib/guide/suggestRoute.js";
import { GUIDE_STEPS, guideStatus, guideStepById } from "../src/lib/guide/guideSteps.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// holes on a grid, 100 m apart; each hole logs `units` top down, `thick` m each (a function of the hole for variety)
function project({ holes = 8, units = ["SST", "SH", "LST", "MDST"], thick = 20, order = () => null, extra = {} } = {}) {
  const collars = [], litho = [];
  for (let i = 0; i < holes; i++) {
    const id = `H${i + 1}`;
    collars.push({ hole_id: id, x: 1000 + (i % 4) * 100, y: 2000 + Math.floor(i / 4) * 100, z: 500, length: units.length * thick + 10 });
    const list = order(i) || units;
    list.forEach((u, k) => litho.push({ hole_id: id, from: k * thick, to: (k + 1) * thick, value: u }));
  }
  return { collars, layers: { litho }, assays: [], assayElements: [], mapLayers: [], terrain: null, sections: [], explicitSurfaces: [], generatedSurfaces: [], stratStack: { units: [], faults: [] }, modellingCodes: null, lithoGroups: [], surfaceStructures: [], voxelModels: [], ...extra };
}
const facts = (p) => { clearGuideFacts(); return guideFacts(p); };
const step = (f, id, guide = {}) => guideStepById(id).status(f, guide);

test("a layered pile in eight holes: computed; step 3 offers Add all; then the stack, built, closes steps 3 and 4", () => {
  const p = project();
  const f = facts(p), r = suggestRoute(f);
  // the top rock starts every hole: it is the cover (#3997), whose top is the ground; the three under it have contacts for tops
  assert.deepEqual(f.order.steady, ["SH", "LST", "MDST"]);
  assert.equal(f.contacts.steadyHoles, 8);
  assert.equal(r.route, "computed"); assert.equal(r.why, "layered"); assert.deepEqual(r.routes, ["computed", "drawn"]);
  assert.match(r.reason, /^3 rocks in a steady order, in 8 holes/);
  const rocks = step(f, "rocks");
  assert.equal(rocks.state, "next");
  assert.deepEqual(rocks.asks.rows.map((x) => [x.key, x.act]), [["cover", "role-overburden"], ["add", "add-all"]]);
  assert.equal(rocks.asks.rows[0].text, "SST starts 8 of 8 holes: the cover.");
  assert.match(rocks.asks.rows[1].text, /^Add the 4 rocks/);
  assert.equal(step(f, "build").state, "waiting"); // the stack first
  // the stack, in the holes' order, and a surface for each unit (params.surface: the run's own record)
  const built = { ...p, stratStack: { units: ["SST", "SH", "LST", "MDST"], faults: [] }, generatedSurfaces: ["SST", "SH", "LST", "MDST"].map((u, i) => ({ id: `s${i}`, name: `Top of ${u}`, type: "stratigraphic_contact", params: { surface: u } })) };
  const f2 = facts(built);
  assert.equal(step(f2, "rocks").state, "done");
  assert.equal(step(f2, "build").state, "done");
  assert.equal(step(f2, "check").state, "next");
  // the stack out of the holes' order: step 3 says how many rocks the holes would move
  const f3 = facts({ ...p, stratStack: { units: ["LST", "SST", "SH", "MDST"], faults: [] } });
  const sort = step(f3, "rocks").asks.rows.find((x) => x.key === "sort");
  assert.ok(sort && f3.stack.plan.moves >= 1, JSON.stringify(f3.stack.plan));
  assert.equal(step(f3, "rocks").state, "next");
});

test("four holes only: drawn, a computed surface would be a guess", () => {
  const f = facts(project({ holes: 4 }));
  const r = suggestRoute(f);
  assert.equal(r.route, "drawn"); assert.equal(r.why, "few-holes");
  assert.match(r.reason, /^Only 4 holes/);
});

test("a repeated (folded) order: the rocks swap places down the holes, so drawn", () => {
  const units = ["A", "B", "C", "D"];
  const f = facts(project({ holes: 12, units, order: (i) => (i % 2 ? [...units].reverse() : units) }));
  const r = suggestRoute(f);
  assert.equal(f.order.steady.length, 0);
  assert.equal(r.route, "drawn"); assert.equal(r.why, "no-order");
  assert.match(r.reason, /^(\d) of \1 rocks swap places/);
  assert.equal(step(f, "rocks").state, "done"); // nothing to stack: build them as bodies
});

test("a map only: the route is the map, and steps 2 and 3 are not needed", () => {
  const poly = (u) => ({ geometry: [[0, 0], [1, 0], [1, 1]], parts: [[[0, 0], [1, 0], [1, 1]]], attributes: { UNIT: u } });
  const f = facts(project({ holes: 0, extra: { mapLayers: [{ id: "m", geomType: "polygon", styleField: "UNIT", features: ["Ka", "Kb", "Kc", "Ka"].map(poly) }], terrain: {} } }));
  const r = suggestRoute(f);
  assert.equal(f.map.units, 3); assert.equal(f.map.polygons, 4);
  assert.equal(r.route, "map"); assert.deepEqual(r.routes, ["map"]);
  assert.equal(step(f, "data").state, "done");
  assert.equal(step(f, "area").state, "skipped");
  assert.equal(step(f, "rocks").state, "skipped");
  assert.equal(step(f, "build").state, "next");
  assert.equal(step(f, "build").asks.act, "mapmodel");
});

test("assays only (Macpass): no route; the guide opens on step 6", () => {
  const p = project({ holes: 5, units: [] });
  p.assays = [{ hole_id: "H1", from: 0, to: 1, Au: 1 }, { hole_id: "H2", from: 0, to: 1, Au: 2 }];
  const f = facts(p);
  assert.equal(suggestRoute(f).route, null);
  assert.equal(step(f, "data").state, "done");
  const g = guideStatus(f, {});
  assert.equal(g.at, "grade");
  assert.deepEqual(g.steps.map((s) => s.state), ["done", "skipped", "waiting", "waiting", "done", "next", "waiting"]);
});

test("a cover rock that starts every hole is offered as the cover; a rock inside another as an intrusion", () => {
  const f = facts(project({ holes: 8, units: ["LMST", "SST", "SH"], order: (i) => (i < 5 ? ["LMST", "SST", "XQ", "SST", "SH"] : null) }));
  const rows = step(f, "rocks").asks.rows;
  const cover = rows.find((x) => x.key === "cover"), cut = rows.find((x) => x.key === "cutting");
  assert.equal(cover.unit, "LMST"); assert.equal(cover.text, "LMST starts 8 of 8 holes: the cover.");
  assert.equal(cut.unit, "XQ"); assert.match(cut.text, /^XQ lies inside another rock in 5 of 5 holes/); // a neutral code: one named as an intrusion (PORPH, QFP) is read as one already
  assert.ok(!f.order.steady.includes("LMST"), "the cover is not a layer of the stack");
});

test("a dyke cut in six or more holes, with no steady layers: computed, its shape", () => {
  const f = facts(project({ holes: 8, units: ["GRAN", "DYKE", "GRAN"] }));
  assert.equal(f.body.unit, "DYKE"); assert.equal(f.body.role, "dyke");
  const r = suggestRoute(f);
  assert.equal(r.route, "computed"); assert.equal(r.why, "body");
  assert.match(r.reason, /^DYKE cuts the rocks in 8 holes/);
});

test("faults and a vein: step 5 counts the evidence, and closes when a fault and the vein are built", () => {
  const p = project();
  p.layers.structure = [1, 2, 3, 4].map((i) => ({ hole_id: `H${i}`, value: "FLT", structure_id: "", dip: 60, azimuth: 90 }));
  p.layers.vein = [1, 2, 3, 4].map((i) => ({ hole_id: `H${i}`, from: 30, to: 31, value: "QV" }));
  const f = facts(p);
  const s = step(f, "faults");
  assert.equal(s.state, "next"); assert.equal(s.asks.suggest, "yes");
  assert.equal(s.reason, "Fault picks: 4");
  assert.deepEqual(s.asks.rows.map((r) => [r.vein, r.done]), [["QV", false]]);
  const f2 = facts({ ...p, generatedSurfaces: [{ id: "f1", type: "fault", name: "Fault: FLT" }, { id: "v1", type: "vein_solid", params: { target: "QV", part: "solid" } }] });
  assert.equal(step(f2, "faults").state, "done");
  // no evidence at all: done, with the way to draw one
  const none = step(facts(project()), "faults");
  assert.equal(none.state, "done"); assert.equal(none.asks.act, "draw-fault");
});

test("an explicit surface drawn for a unit counts as that unit's surface (its surfaceId, type explicit_surface)", () => {
  const p = project({ holes: 4 });
  p.stratStack = { units: ["SST", "SH"], faults: [] };
  p.explicitSurfaces = [{ id: "d1", name: "SH top", unit: "SH", surfaceId: "e1" }, { id: "d2", name: "SST top", unit: "SST", surfaceId: "e2" }];
  p.generatedSurfaces = [{ id: "e1", type: "explicit_surface" }, { id: "e2", type: "explicit_surface" }];
  const f = facts(p);
  assert.equal(f.drawn.explicitBuilt, 2);
  assert.equal(suggestRoute(f).route, "drawn");
  assert.equal(step(f, "build").state, "done");
});

test("one pass over a 200,000-row log, and the same object back until the project changes", () => {
  let reads = 0;
  const N = 200000, litho = new Array(N);
  for (let i = 0; i < N; i++) {
    const h = `H${i % 400}`, k = Math.floor(i / 400), row = { from: k * 2, to: k * 2 + 2, value: ["SST", "SH", "LST"][Math.floor(k / 167) % 3] };
    Object.defineProperty(row, "hole_id", { get: () => { reads++; return h; }, enumerable: true });
    litho[i] = row;
  }
  const collars = Array.from({ length: 400 }, (_, i) => ({ hole_id: `H${i}`, x: (i % 20) * 50, y: Math.floor(i / 20) * 50, z: 0, length: 1000 }));
  const p = { ...project({ holes: 0 }), collars, layers: { litho } };
  clearGuideFacts();
  const f = guideFacts(p);
  assert.equal(reads, N, "each row's hole is read once");
  assert.equal(f.logged.rows, N);
  assert.equal(guideFacts(p), f, "memoized on the store's references");
  assert.equal(reads, N);
  assert.notEqual(guideFacts({ ...p, collars: [...collars] }), f, "a new table reads again");
});

test("the steps keep the design's word limits: a title of up to 3 words, a line up to 10, a question up to 8", () => {
  const w = (s) => (String(s || "").match(/[\p{L}\p{N}][\p{L}\p{N}'%/.-]*/gu) || []).length;
  assert.deepEqual(GUIDE_STEPS.map((s) => s.id), ["data", "area", "rocks", "build", "faults", "grade", "check"]);
  for (const s of GUIDE_STEPS) {
    assert.ok(w(s.title) <= 3 && w(s.line) <= 10 && w(s.question) <= 8, s.id);
    assert.equal(typeof s.status, "function");
  }
});

test("the three files reach neither three.js, the model runs, the desurvey nor the desktop bridge", () => {
  const seen = new Set(), bad = [];
  const walk = (file) => {
    if (seen.has(file)) return; seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/^\s*(?:import|export)[^"'\n]*?from\s+["']([^"']+)["']/gm)) {
      const spec = m[1];
      if (!spec.startsWith(".")) { if (/^three/.test(spec)) bad.push(`${path.relative(ROOT, file)} -> ${spec}`); continue; }
      const next = path.resolve(path.dirname(file), spec);
      if (/modellingRuns|desurvey|desktop\.js|ViewerModule|\.jsx$/.test(next)) bad.push(`${path.relative(ROOT, file)} -> ${spec}`);
      if (existsSync(next)) walk(next);
    }
  };
  for (const f of ["guideFacts.js", "guideSteps.js", "suggestRoute.js"]) walk(path.join(ROOT, "src/lib/guide", f));
  assert.deepEqual(bad, []);
  assert.ok(seen.size > 5);
});

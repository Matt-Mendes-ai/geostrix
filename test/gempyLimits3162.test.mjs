// TASKS.csv #3162 — a stack with more units (or faults) than GemPy takes in one model: said before the run, in words, with what can be
// done; the engine's validation text never reaches the user. Mount Raymond's Model from map stack has 13 tops; the engine took 12.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GEMPY_MAX_SURFACES, GEMPY_MAX_FAULTS, gempyLimitCheck, plainEngineError } from "../src/lib/gempyLimits.js";

test("the app's limits are the engine's (python-sidecar/app/main.py ImplicitModelRequest)", () => {
  const py = readFileSync(new URL("../python-sidecar/app/main.py", import.meta.url), "utf8");
  const req = py.slice(py.indexOf("class ImplicitModelRequest"), py.indexOf("class ImplicitModelRequest") + 2000);
  assert.equal(Number(req.match(/surfaces: List\[SurfaceInput\] = Field\(\.\.\., min_length=1, max_length=(\d+)\)/)[1]), GEMPY_MAX_SURFACES);
  assert.equal(Number(req.match(/faults: List\[SurfaceInput\] = Field\(default_factory=list, max_length=(\d+)\)/)[1]), GEMPY_MAX_FAULTS);
  assert.ok(GEMPY_MAX_SURFACES >= 13, "Mount Raymond's 13 tops fit");
});

test("the check counts units and faults apart", () => {
  const units = (n) => Array.from({ length: n }, (_, i) => ({ label: `Top of U${i}` }));
  const faults = (n) => Array.from({ length: n }, (_, i) => ({ label: `F${i}`, fault: true }));
  assert.equal(gempyLimitCheck(units(GEMPY_MAX_SURFACES)), null);
  assert.equal(gempyLimitCheck([...faults(GEMPY_MAX_FAULTS), ...units(3)]), null);
  assert.deepEqual(gempyLimitCheck(units(GEMPY_MAX_SURFACES + 1)), { surfaces: GEMPY_MAX_SURFACES + 1, faults: 0, maxSurfaces: GEMPY_MAX_SURFACES, maxFaults: GEMPY_MAX_FAULTS, overSurfaces: true, overFaults: false });
  const f = gempyLimitCheck([...faults(GEMPY_MAX_FAULTS + 1), ...units(2)]);
  assert.ok(f.overFaults && !f.overSurfaces && f.faults === GEMPY_MAX_FAULTS + 1);
  assert.equal(gempyLimitCheck([]), null);
});

test("the engine's list-length refusal in words where a run fails; other text unchanged", () => {
  assert.equal(plainEngineError("surfaces: List should have at most 12 items after validation, not 13"), "The modelling engine takes at most 12 units in one model, and this one has 13");
  assert.equal(plainEngineError("request.faults: List should have at most 6 items after validation, not 9"), "The modelling engine takes at most 6 faults in one model, and this one has 9");
  assert.equal(plainEngineError("Cancelled."), "Cancelled.");
  assert.equal(plainEngineError(undefined), undefined);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /errorNotice\(tr\("\{label\} failed: \{error\}", \{ label, error: plainEngineError\(res\.error\) \}\)\)/);
  // kept out of the startup bundle (#3159): desktop.js is eager
  assert.doesNotMatch(readFileSync(new URL("../src/lib/desktop.js", import.meta.url), "utf8"), /gempyLimits/);
});

test("Model from map's contact step: 25 m on a small map, lengthened over the point budget to keep about that many points", async () => {
  const { mapContactStep, MAP_CONTACT_STEP_M, MAP_POINT_BUDGET } = await import("../src/lib/gempyLimits.js");
  assert.equal(MAP_CONTACT_STEP_M, 25);
  assert.equal(mapContactStep(20000), 25, "Perk-Rocky's size: 800 points");
  assert.equal(mapContactStep(MAP_POINT_BUDGET * 25), 25, "at the budget");
  const big = 15334 * 25; // Mount Raymond's contacts in use (15,334 points at 25 m)
  const s = mapContactStep(big);
  assert.ok(s > 25 && big / s <= MAP_POINT_BUDGET && big / s > MAP_POINT_BUDGET * 0.99, `${s} m`);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /const stepM = mapContactStep\(usedM\);/);
  assert.match(m, /for \(const line of c\.lines\) for \(const \[x, y\] of thin\(line, stepM\)\)/);
});

test("wiring: the stack run checks before solving (not a layer-cake), the map's run says its own routes, a longer stack can be kept", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /const overLimit = cakeRun \? null : gempyLimitCheck\(specs\);/);
  assert.ok(s.indexOf("const overLimit") < s.indexOf("setImplicitBusy(true);"), "before the run starts");
  assert.match(s, /runSurfaceStack\(\[\.\.\.faultSpecs, \.\.\.specs\], \{ fromMap: true/);
  const m = readFileSync(new URL("../src/modules/viewer/useModelling.js", import.meta.url), "utf8");
  assert.doesNotMatch(m, /Stacks are capped at 12 units/);
  assert.doesNotMatch(m, /gempyLimits/, "useModelling is in the startup bundle: no new code there (#3159)");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Not run: {why}", "GemPy takes at most {max} faults in one model, and this run has {n}: leave out the ones that offset the units least.",
      " The map's contacts were sampled every {s} m, not every {s0} m, to keep about {n} points: GemPy's memory grows with the square of the points ({n0} at {s0} m)."]) assert.ok(d[k], `${l}: ${k}`);
  }
});

// TASKS.csv #3162 follow-up — GemPy's time: the work model and Model from map's thinning to the budget
test("the work model: rows x (block + check points + the meshes' edges), by GemPy's fields", async () => {
  const { gempyWork, GEMPY_EDGE_EVALS_PER_SURFACE: D } = await import("../src/lib/gempyLimits.js");
  const ori = [{ x: 0, y: 0, z: 0, dip: 10, azimuth: 90 }, { x: 5, y: 0, z: 0, dip: 12, azimuth: 90 }];
  const pts = (n) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, z: 0 }));
  const specs = [{ points: pts(10), orientations: ori }, { points: pts(20), orientations: ori }];
  // onlap: one field, a shared orientation once (main.py's dedupe): (30 + 3 x 2) x (1000 + 100 + 2D)
  assert.equal(gempyWork(specs, { blockCells: 1000, evalPts: 100, relation: "onlap" }), 36 * (1100 + 2 * D));
  // erode: a field per surface, each with its own copy of the measurements
  assert.equal(gempyWork(specs, { blockCells: 1000, evalPts: 100, relation: "erode" }), (16 + 26) * (1100 + D));
  // packages: by package; a fault is a field of its own
  assert.equal(gempyWork([{ ...specs[0], package: 0 }, { ...specs[1], package: 0 }, { points: pts(4), orientations: [ori[0]], fault: true }], { blockCells: 1000, relation: "erode" }), 36 * (1000 + 2 * D) + 7 * (1000 + D));
});

test("thinning to the budget: Mount Raymond's shape (13 tops, 4,016 points, 262 shared orientations, its block and check points)", async () => {
  const { thinForWork, gempyWork, GEMPY_WORK_BUDGET } = await import("../src/lib/gempyLimits.js");
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ori = Array.from({ length: 262 }, () => ({ x: rnd() * 24000, y: rnd() * 30000, z: 500, dip: 30, azimuth: 270 }));
  const sizes = [44, 269, 313, 4, 229, 232, 226, 729, 232, 679, 213, 523, 323];
  const specs = sizes.map((n, k) => ({ meshName: `U${k}`, points: Array.from({ length: n }, (_, i) => ({ x: i * 25, y: k * 100, z: 500 })), orientations: ori }));
  specs[7].points.push({ x: 1, y: 2, z: 3, hole_id: "H1" }); // a logged contact
  const opts = { blockCells: 96 * 96 * 5, evalPts: 19812, relation: "onlap" };
  assert.ok(gempyWork(specs, opts) > 8 * GEMPY_WORK_BUDGET, "about 2,600 s at the measured rate");
  const t = thinForWork(specs, opts);
  assert.ok(t.workAfter <= GEMPY_WORK_BUDGET * 1.03, `${t.workAfter}`);
  assert.equal(t.before.points, 4017); assert.equal(t.before.orientations, 262);
  // the measured 350 s run had 410 points and 88 orientations: about that
  assert.ok(t.after.points > 250 && t.after.points < 450, `${t.after.points}`);
  assert.ok(t.after.orientations > 70 && t.after.orientations < 110, `${t.after.orientations}`);
  assert.ok(t.specs.every((s) => s.orientations === t.specs[0].orientations), "one shared set: the onlap field still takes it once");
  assert.ok(t.specs[7].points.some((q) => q.hole_id === "H1"), "a logged contact is kept");
  assert.ok(t.specs.every((s, i) => s.points.length >= Math.min(3, sizes[i])), "every top keeps 3 points");
  assert.ok(t.specs[3].points.length >= 3, "a 4-point top keeps at least 3");
  // erode: every surface's own field takes the measurements: they are thinned harder, the points keep most of the budget
  const e = thinForWork(specs, { ...opts, relation: "erode" });
  assert.ok(e.workAfter <= GEMPY_WORK_BUDGET * 1.03 && e.after.points > 600 && e.after.orientations < 40, JSON.stringify(e.after));
  // a small map is left alone
  assert.equal(thinForWork(specs.slice(0, 3).map((s) => ({ ...s, points: s.points.slice(0, 100), orientations: ori.slice(0, 30) })), opts), null);
});

test("wiring: a Model from map run thins before the request, with the check points counted, and says so", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /const workOpts = \{ blockCells: resolution\[0\] \* resolution\[1\] \* resolution\[2\], evalPts: evalPts\?\.length \|\| 0, relation \};/);
  assert.match(s, /if \(stackOpts\.fromMap && !cakeRun && !stackOpts\.fullDetail\) \{\s*const tw = thinForWork\(specs, workOpts\);/);
  assert.ok(s.indexOf("const evalPts = evalAll.length") < s.indexOf("const tw = thinForWork"), "the check points are known first");
  assert.ok(s.indexOf("const tw = thinForWork") < s.indexOf("const sidecarSpecs = specs.map("), "before the request is built");
  assert.ok(s.indexOf("const tw = thinForWork") < s.indexOf("\"Running {label} ("), "the Running notice counts what is sent");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["To keep GemPy's run to a few minutes, {p} of the map's {pAll} contact points and {o} of its {oAll} orientations were used, spread evenly (contacts logged in holes are all kept). GemPy's time grows with the data times the points it evaluates: the lithology block ({b} cells), the model check and map points ({e}) and the meshes of {s} surfaces. A lower Resolution (Model settings) or fewer units leaves more of the data in."], l);
  }
});

test("full detail (Model from map): nothing thinned, the run says the points and how many times a default run's work, the 15-minute stop off for it", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /fullDetail: !!p\.fullDetail/);
  assert.match(s, /const overWork = stackOpts\.fromMap && !cakeRun && stackOpts\.fullDetail \? gempyWork\(specs, workOpts\) \/ GEMPY_WORK_BUDGET : 0;/);
  assert.match(s, /\.\.\.\(overWork > 1 \? \{ maxMinutes: 0 \} : \{\}\)/);
  const d = readFileSync(new URL("../src/lib/desktop.js", import.meta.url), "utf8");
  assert.match(d, /const deadline = opts\.maxMinutes === 0 \? Infinity : Date\.now\(\) \+ 15 \* 60 \* 1000;/);
  const panel = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /holeCodes: useHoles && holeCount > 0 \? codeUnit : null, fullDetail \}\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Full detail: send all the sampled contacts (can take much longer)", "Full detail: GemPy gets all {p} contact points and {o} orientations, about {x} times the work of a default run (which is sized for a few minutes), so this run may take a long time. The 15-minute stop is off for it: Cancel on the status bar stops it."]) assert.ok(j[k], `${l}: ${k}`);
  }
});

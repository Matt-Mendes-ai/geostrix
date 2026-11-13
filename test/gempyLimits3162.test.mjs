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

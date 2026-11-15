// TASKS.csv #2640 Stage 1 — the structure-fit sensitivity pass: the app's job wrapper and the engine's wiring, limits and rules pinned (the
// physics is checked in python-sidecar/tests/test_structfit.py: seen / not constrained, the step's stability, the re-solve, the size guard)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#2640 the job: the app's wrapper, the job kind, the validator, the shared model build", () => {
  assert.match(rd("../src/lib/desktop.js"), /export const runStructfitJob = \(request, opts\) => runSidecarJobKind\("structfit", request, opts\);/);
  const jobs = rd("../python-sidecar/app/jobs.py");
  assert.match(jobs, /elif kind == "structfit":[\s\S]*?from app\.geophys\.structfit import run_job as run_structfit/);
  const main = rd("../python-sidecar/app/main.py");
  assert.match(main, /if req\.get\("jobKind"\) == "structfit":[\s\S]*?_validate_structfit\(payload\)/);
  assert.match(main, /an observation, so it never moves/); // a drillhole contact is refused
  assert.match(main, /the distance it may move \(above 0, at most 5,000 m\): GeoStrix never assumes it/);
  // the endpoint and the job build GemPy's model the same way
  assert.match(main, /frame, fault_group_names, fault_elements, deduped = _implicit_frame\(req\)/);
  assert.match(main, /model = _implicit_geomodel\(req, res, frame, fault_group_names\)/);
});

test("#2640 the engine's limits: a 10-minute guard from a timed solve, 20 points, 32 cells a side, vertical moves, properties as entered", () => {
  const sf = rd("../python-sidecar/app/geophys/structfit.py");
  assert.match(sf, /^MAX_SECONDS = 600\.0/m); assert.match(sf, /^MAX_POINTS = 20/m); assert.match(sf, /^MAX_RES = 32/m);
  assert.match(sf, /if est > MAX_SECONDS and not req\.get\("allowLong"\):/);
  assert.match(sf, /s\.points\[k\] = p\.model_copy\(update=\{"z": float\(p\.z\) \+ float\(dz\)\}\)/); // vertical only
  assert.match(sf, /if req\.get\("resolve"\):/); // re-solving the properties is an option
  assert.ok(rd("../python-sidecar/tests/smoke_jobs.py").includes('r = run_job("structfit", sf)'));
});

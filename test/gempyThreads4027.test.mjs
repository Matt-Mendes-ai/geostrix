// TASKS.csv #4027 — GemPy's field evaluation runs on several threads (python-sidecar/app/gempy_threads.py). The sidecar's own test
// (python-sidecar/tests/test_gempy_threads.py, run with the venv's python) checks the model is bit-for-bit the same; these pins keep the
// wiring and the two rules it depends on: every GemPy model is built through _implicit_geomodel, which installs it, and the distance
// buffer GemPy shares between a scalar kernel and its gradients is per thread.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../python-sidecar/app/main.py", import.meta.url), "utf8");
const threads = readFileSync(new URL("../python-sidecar/app/gempy_threads.py", import.meta.url), "utf8");
const electron = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");

test("every GemPy model (the implicit model, the structure fit) installs the threaded evaluation before it is built", () => {
  const body = main.slice(main.indexOf("def _implicit_geomodel("), main.indexOf("model = gp.create_geomodel(", main.indexOf("def _implicit_geomodel(")));
  assert.match(body, /from app\.gempy_threads import install as threaded_evaluation/);
  assert.match(body, /\n\s+threaded_evaluation\(\)\r?\n/);
});

test("GemPy's scalar-to-gradient distance buffer is per thread, and the evaluator replaced is the one the solve calls", () => {
  assert.match(threads, /class _PerThreadDistances\(threading\.local\):\s+last_internal_distances_matrices = None\s+ka\.DistancesBuffer = _PerThreadDistances\(\)/);
  assert.match(threads, /isf\.generic_evaluator = threaded_evaluator/);
  assert.match(threads, /ge\._eval_on\(solver_input=solver_input, weights=weights, options=options, slice_array=s\)/);
});

test("the thread count follows the BLAS rule (#440): half the logical cores, at most 4, unless GEOSTRIX_GEMPY_THREADS says", () => {
  assert.match(threads, /return max\(1, min\(4, \(os\.cpu_count\(\) or 2\) \/\/ 2\)\)/);
  assert.match(electron, /Math\.max\(1, Math\.min\(4, Math\.floor\(require\("os"\)\.cpus\(\)\.length \/ 2\)\)\)/);
  assert.match(threads, /os\.environ\.get\("GEOSTRIX_GEMPY_THREADS"\)/);
});

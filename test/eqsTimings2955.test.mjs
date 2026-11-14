// TASKS.csv #2955 (review #2876) — equivalent-source gridding of 1,701 stations took 72-172 s with only "Working..." for the first 40: each job
// runs in a fresh process (jobs.py, #321) and imports Harmonica and Verde, measured 19-24 s of a 24-29 s run on a busy machine (the fit 3-4
// s). The load is now said before it starts and timed, and the result's timings are printed. The numbers are checked in
// python-sidecar/tests/test_pfields.py (check_eqs); this pins the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the sidecar says the engine load first and returns the stage timings; the pane prints them", () => {
  const py = readFileSync(new URL("../python-sidecar/app/geophys/pfields.py", import.meta.url), "utf8");
  assert.match(py, /def _engine\(progress, label="the gridding engine \(Harmonica, Verde\)"\):/);
  assert.match(py, /progress\(\{"stage": "loading", "message": f"Loading \{label\}, the longest step of a small survey; it stays loaded for about 3 minutes after a run/); // #3124
  assert.match(py, /def eqs\(req, progress\):\r?\n    load_s = _engine\(progress\)/);
  assert.match(py, /"timings": \{"load": round\(load_s, 1\), "fit": round\(fit_s, 1\), "grid": round\(time\.perf_counter\(\) - t_grid, 1\)\}/);
  const box = readFileSync(new URL("../src/components/EqsGridBox.jsx", import.meta.url), "utf8");
  assert.match(box, /d\.warmEngine\s*\? tr\("The engine was still loaded from a run in the last few minutes: the fit took \{b\} s and the grid \{c\} s\."/); // #3124
  assert.match(box, /: tr\("Of the time, loading the engine took \{a\} s \(it then stays loaded for about 3 minutes, so a run soon after skips it\), the fit \{b\} s and the grid \{c\} s\."/);
  // #3124 — the warm worker (python-sidecar/app/jobs.py; its behaviour in python-sidecar/tests/test_warm_jobs.py)
  const jobs = readFileSync(new URL("../python-sidecar/app/jobs.py", import.meta.url), "utf8");
  assert.match(jobs, /WARM_KINDS = \{"pfields"(, "implicit")?\}/); // "implicit": #3281
  assert.match(jobs, /WARM_IDLE_S = float\(os\.environ\.get\("GEOSTRIX_WARM_IDLE_S", "180"\)\)/);
  assert.match(jobs, /self\._retire_warm\(\)  # an inversion, another kind, or an expired worker: its memory back first/);
});

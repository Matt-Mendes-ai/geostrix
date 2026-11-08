// TASKS.csv #1985 — Harmonica / Verde / Boule in the Python engine: Euler deconvolution of a grid, equivalent-source gridding of a survey.
// The maths is checked against closed-form fields in python-sidecar/tests/test_pfields.py (a point mass's depth and position; a
// draped survey continued to 150 m); this pins the pins, the freeze, the job API and the app's wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync as readRaw } from "node:fs";
// v0.1.103 release CI: the Windows runner checks the sources out with CRLF, so the text pins compare LF text
const readFileSync = (p, enc) => readRaw(p, enc).replace(/\r\n/g, "\n");
import { SURVEY_METHODS } from "../src/lib/geophysSurveys.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("pinned exactly, the whole tree in constraints, and frozen with their metadata", () => {
  const req = read("python-sidecar/requirements.txt"), con = read("python-sidecar/constraints.txt");
  for (const p of ["harmonica==0.7.0", "verde==1.9.0", "boule==0.7.0"]) { assert.ok(req.includes(p), p); assert.ok(con.includes(p), p); }
  for (const p of ["xarray==", "pandas==", "scikit-learn==", "dask==", "xrft==", "pooch=="]) assert.ok(con.includes(p), p);
  const b = read("python-sidecar/build_sidecar.js");
  assert.ok(b.includes('"--collect-submodules", "harmonica", "--collect-submodules", "verde", "--collect-submodules", "boule",'));
  assert.ok(b.includes('"--copy-metadata", "harmonica", "--copy-metadata", "verde", "--copy-metadata", "boule", "--copy-metadata", "xarray", "--copy-metadata", "pandas",'));
});

test("the engine: a 'pfields' job, validated, run in its own process", () => {
  const m = read("python-sidecar/app/main.py"), j = read("python-sidecar/app/jobs.py"), p = read("python-sidecar/app/geophys/pfields.py");
  assert.match(m, /if req\.get\("jobKind"\) == "pfields":[\s\S]*?_validate_pfields\(payload\)[\s\S]*?manager\.start\("pfields", payload\)/);
  assert.match(m, /PFIELDS_MAX_GRID = 4_000_000/);
  assert.match(m, /The window must be at least 3 cells and at most half the grid wide\./);
  assert.match(j, /elif kind == "pfields":[\s\S]*?from app\.geophys\.pfields import run_job as run_pfields/);
  assert.match(p, /m = hm\.EulerDeconvolution\(structural_index=si\)\.fit\(tuple\(c\), tuple\(d\)\)/);
  assert.match(p, /hm\.EquivalentSourcesGB\(\*\*kw, random_state=0\) if gb else hm\.EquivalentSources\(\*\*kw\)/);
  assert.match(p, /if depth > max_depth_windows \* win or sd \/ depth > max_unc:/);
  assert.match(p, /depth_m = float\(depth\) if depth not in \(None, ""\) else 1\.2 \* spacing/, "sources 1.2 x the cell deep unless entered (Harmonica's 4.5 x spacing fitted a ground survey to 20 %)");
  assert.match(p, /resid = bv - \(model\.predict\(\(bmean\(x\), bmean\(y\), bmean\(z\)\)\) \+ mean\)/, "the fit is judged against the block means");
});

test("the app: Euler in the grid filters, equivalent sources on each survey, one job helper", () => {
  const d = read("src/lib/desktop.js"), r = read("src/modules/RasterModule.jsx"), g = read("src/modules/GeophysicsModule.jsx"), box = read("src/components/EqsGridBox.jsx");
  // #1986: one runner for the job kinds (pfields, em1d)
  assert.match(d, /export const runPfieldsJob = \(request, opts\) => runSidecarJobKind\("pfields", request, opts\);/);
  assert.match(d, /async function runSidecarJobKind\(kind, request, \{ signal = null, onProgress = null \} = \{\}\) \{\n  const start = await startSidecarJob\(kind, request\);/);
  assert.ok(r.includes('<option value="euler">'));
  assert.match(r, /runPfieldsJob\(\{ op: "euler", nx: g\.nx, ny: g\.ny, dx: g\.dx, dy: g\.dy, x0: g\.x0, yTop: g\.yTop, values: g\.values, structural_index: Number\(filt\.si\), window: win, observation_elevation: 0 \}/);
  assert.match(r, /z: Number\.isFinite\(ground\) \? \+\(ground - d\.depth\[i\]\)\.toFixed\(1\) : null/);
  assert.ok(g.includes('const EqsGridBox = React.lazy(() => import("../components/EqsGridBox.jsx"));'));
  assert.ok(g.includes('{!["euler_depth", "mt_bostick", "lidar", "em1d_cond"].includes(meta.method) /* derived points at depth, not readings; lidar: #1994; em1d_cond: #1986 */ && <button'), "not offered on derived points (nor on a lidar cloud, #1994)");
  assert.match(box, /runPfieldsJob\(request, \{ signal: abort\.current\.signal/);
  assert.equal(SURVEY_METHODS.euler_depth.units, "m");
});

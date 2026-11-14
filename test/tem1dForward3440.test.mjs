// TASKS.csv #3440 step 1 — the TEM forward model lives in the Python engine (python-sidecar/app/geophys/tem1d.py, checked by
// python-sidecar/tests/test_tem1d.py in the sidecar workflow); these pins keep the pieces it depends on in place
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3440 the forward model: the FDEM kernel, empymod's lagged-convolution sine transform, the waveform and gate quadrature", () => {
  const py = rd("../python-sidecar/app/geophys/tem1d.py");
  assert.match(py, /from \.em1d import MU0, _filt, _numba_kernel/); // the validated recursion and its Jacobian
  assert.match(py, /empymod\.utils\.check_time\(t, -1, "dlf", \{"dlf": "key_201_2012", "pts_per_dec": -1\}, 0\)/);
  assert.match(py, /def forward\(cond, thick, system, gates, widths=None, waveform=None, jac=False\):/);
  assert.match(py, /res\[s\] = -np\.real\(np\.squeeze\(tEM\)\)  # positive for a normal decay/);
});

test("#3440 the checks run in the sidecar workflow, with empymod and libdlf in the engine's requirements", () => {
  const wf = rd("../.github/workflows/sidecar.yml");
  assert.match(wf, /- name: 1D TEM forward tests \(#3440\)\n {8}working-directory: python-sidecar\n {8}run: python tests\/test_tem1d\.py/);
  const req = rd("../python-sidecar/requirements.txt");
  assert.match(req, /^empymod==2\.6\.1$/m);
  const t = rd("../python-sidecar/tests/test_tem1d.py");
  for (const f of ["check_half_space()", "check_against_empymod()", "check_against_simpeg()", "check_waveform_and_gates()", "check_jacobian()"]) assert.ok(t.includes(`    ${f}`), f);
});

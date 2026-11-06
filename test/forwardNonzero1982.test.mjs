// TASKS.csv #1982 — a plate forward model on Woodjam's 20,000-station planned grid took about 6.5 minutes: the simulation walked every
// station against every below-ground cell although only the plate's cells are non-zero. The integral forward is linear, so it is built
// on the non-zero cells now (same numbers: python-sidecar/tests/test_potential.py and the #1982 bench, 0 nT difference).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const py = readFileSync(new URL("../python-sidecar/app/geophys/potential.py", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("forward runs build the simulation on the cells that are non-zero in some model", () => {
  assert.match(py, /def _forward_nonzero\(method, mesh, actv, st, field, models\):/);
  assert.match(py, /use = actv & np\.any\(np\.vstack\(\[np\.asarray\(m\) != 0 for m in models\]\), axis=0\)/);
  assert.match(py, /_, sim = _survey_and_sim\(method, mesh, use, st, field, "forward_only"\)/);
});

test("both forward bodies use it; no forward simulation on every active cell is left", () => {
  assert.match(py, /pred = _forward_nonzero\(method, mesh, actv, st, field, \[mc\]\)\[0\]/);
  assert.match(py, /preds = _forward_nonzero\(method, mesh, actv, st, field, \[float\(pl\["contrast"\]\) \* f for pl, f in zip\(plates, fracs\)\]\)/);
  assert.ok(!py.includes('_survey_and_sim(method, mesh, actv, st, field, "forward_only")'));
});

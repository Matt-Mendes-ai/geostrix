// TASKS.csv #4106 — the geoML grade model's covariance. geoML's default (Gaussian) overshot between the holes and the back-transform put
// grades above any sample beside them, so a grade shell missed the intercepts; the add-on now trains the grade model with the exponential
// covariance. CI has no geoML, so the model itself is checked by addons/geoml/tests/test_grade_placement.py (a synthetic box body must come back
// within half a block, no block above the highest sample) on a machine with the add-on's venv; this pins the wiring that test depends on.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const models = read("../addons/geoml/geostrix_geoml/models.py");
const server = read("../addons/geoml/geostrix_geoml/server.py");

test("#4106 the grade model is built with the exponential covariance unless a request names another", () => {
  assert.match(models, /^GRADE_KERNEL = "exponential"$/m);
  assert.match(models, /GRADE_KERNELS = \{"exponential": "Exponential"/);
  assert.match(models, /geoml\.latent\.BasicGP\(root, size=1, kernel=getattr\(geoml\.kernels, GRADE_KERNELS\[kname\]\)\(\)\)/);
  // the kernel is a training input: a different one must train again, never re-predict a kept model (#4055)
  const predictOnly = models.match(/"grade": \{([^}]*)\}/)[1];
  assert.doesNotMatch(predictOnly, /kernel/);
  // the result says which kernel built it
  assert.match(models, /"kernel": g\.get\("kernel"\)/);
});

test("#4106 the add-on says it has the change, and the app records the kernel with the model", () => {
  assert.match(server, /ADDON_VERSION = "0\.1\.7"/);
  assert.match(server, /"grade_kernel"/);
  const panel = read("../src/components/PredictivePanel.jsx");
  assert.match(panel, /kernel: res\.kernel \|\| "gaussian"/);
});

test("#4106 the placement test is synthetic", () => {
  const t = read("../addons/geoml/tests/test_grade_placement.py");
  assert.match(t, /f"SYN-\{i \+ 1:02d\}"/);
  assert.match(t, /assert np\.all\(np\.abs\(off\) <= CELL \/ 2\)/);
  assert.match(t, /assert pred\.max\(\) <= vals\.max\(\) \* 1\.02/);
});

// TASKS.csv #1577 — round precious-metal cutoffs, metal in kg / troy oz (t for base metals), no table on a support index or kriging
// variance, and grade-tonnage reachable from the estimation result and 3D Modelling.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { autoCutoffs, metalColumns, metalOf, gradeTonnageRows, isGradeTonnageModel } from "../src/lib/gradeTonnage.js";

const cells = (vals) => vals.map((value) => ({ value, dx: 10, dy: 10, dz: 10 }));

test("Au in ppm / g/t: 0 and the round grades up to the top value; ppb scaled; base metals keep percentiles", () => {
  const v = cells([0.001, 0.005, 0.02, 0.09, 0.4, 0.8, 1.6, 3.1]);
  assert.deepEqual(autoCutoffs(v, { element: "Au", unit: "ppm" }), [0, 0.1, 0.3, 0.5, 1, 2]);
  assert.deepEqual(autoCutoffs(v, { element: "Au", unit: "g/t" }), [0, 0.1, 0.3, 0.5, 1, 2]);
  assert.deepEqual(autoCutoffs(cells([5, 50, 400, 1200, 6000]), { element: "Au", unit: "ppb" }), [0, 100, 300, 500, 1000, 2000, 5000]);
  const pct = autoCutoffs(v, { element: "Zn", unit: "ppm" });
  assert.notDeepEqual(pct, [0, 0.1, 0.3, 0.5, 1, 2]);
  // too few round grades reached (a very low-grade model): percentiles
  assert.notDeepEqual(autoCutoffs(cells([0.001, 0.01, 0.05, 0.12]), { element: "Au", unit: "ppm" }).slice(0, 2), [0, 0.1]);
});

test("metal columns: kg and troy oz for a precious metal, t for a base metal in ppm or %", () => {
  assert.deepEqual(metalColumns(metalOf("ppm"), "Au").map((c) => c.key), ["metal_kg", "metal_oz"]);
  assert.deepEqual(metalColumns(metalOf("ppm"), "Cu").map((c) => c.key), ["metal_t"]);
  assert.deepEqual(metalColumns(metalOf("%"), "Zn").map((c) => [c.key, c.factor]), [["metal_t", 1]]);
  assert.deepEqual(metalColumns(null, "Au"), []);
  // the review's 152,623,885 g = 152,624 kg = 4,906,972 troy oz
  const row = gradeTonnageRows([{ cutoff: 0, blocks: 1, volumeM3: 1, meanGrade: 1, tonnes: 1, metal: 152623885 }], { vname: "Au_ppm", density: 2.4, metal: metalOf("ppm"), columns: metalColumns(metalOf("ppm"), "Au") })[0];
  assert.equal(Math.round(row.metal_kg), 152624);
  assert.equal(row.metal_oz, 4906970); // 4,906,971.8 written to 6 significant digits
  assert.ok(!("metal_g" in row));
});

test("no table on a support index or a kriging variance; reachable from the result and 3D Modelling", () => {
  assert.equal(isGradeTonnageModel({ source: "support-index-ok" }), false);
  assert.equal(isGradeTonnageModel({ source: "kriging-variance" }), false);
  assert.equal(isGradeTonnageModel({ source: "estimate-ok" }), true);
  assert.match(fs.readFileSync("src/modules/GeophysicsModule.jsx", "utf8"), /\/\^support-index-\|\^kriging-variance\$\/\.test\(String\(model\.source \|\| ""\)\) \/\* #1577 \*\//);
  assert.match(fs.readFileSync("src/components/GradeEstimationModal.jsx", "utf8"), /onClick=\{\(\) => setGtOpen\(true\)\}/);
  assert.match(fs.readFileSync("src/modules/viewer/ModellingPanes.jsx", "utf8"), /<GradeTonnageLauncher \/>/);
});

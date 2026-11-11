// TASKS.csv #1848 / #1614 / #1849 (review #1646, Kodiak) — the pit shell never prices a geophysical model as a grade
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeCandidate } from "../src/lib/gradeCandidate.js";

const cells = [{ x: 0, y: 0, z: 0, v: 1 }];

test("Kodiak's chargeability and resistivity models are not grades, by name token, property or source", () => {
  assert.equal(gradeCandidate({ name: "MPD-2023_ipinv3d_r3i04_chg", property: "value", source: "csv", cells }), false);
  assert.equal(gradeCandidate({ name: "MPD-2023_ipinv3d_r3i04_res", source: "csv", cells }), false);
  assert.equal(gradeCandidate({ name: "3dmesh_utm", property: "Chargeability (mV/V)", source: "ubc", cells }), false);
  assert.equal(gradeCandidate({ name: "3dmesh_utm", property: null, source: "ubc", cells }), false, "a UBC-GIF mesh with its unit 'Not stated'");
  assert.equal(gradeCandidate({ name: "femtic_amt_model", source: "csv", cells }), false);
  assert.equal(gradeCandidate({ name: "susc_mvi", source: "omf", cells }), false);
});

test("grade models still count", () => {
  for (const name of ["Au_ID2", "Cu estimate", "Kriged Au", "Zn_ppm_ok", "Resource model Au", "Copley Cu OK"]) {
    assert.equal(gradeCandidate({ name, source: "csv", cells }), true, name);
  }
  assert.equal(gradeCandidate({ name: "Cu", property: "Cu (%)", source: "estimate", cells: [] }), false, "no cells");
});

test("the pane uses it and says why the project's models are not offered", () => {
  const p = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("voxelModels.filter((m) => gradeCandidate(m, (x) => cat.has(x)))"));
  // #2436 — the note moved to NotOfferedGrades.jsx, shown whenever a model is left out
  assert.ok(p.includes("<NotOfferedGrades voxelModels={voxelModels} />"));
  assert.ok(readFileSync(new URL("../src/components/NotOfferedGrades.jsx", import.meta.url), "utf8").includes("Not offered: {list}. Geophysical, categorical and estimation-quality models are not grades."));
});

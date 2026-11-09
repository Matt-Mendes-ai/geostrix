// TASKS.csv #2218 — 3D Modelling reads gold in g/t too (#1680): shell names and messages, estimation results, grade-tonnage, the 3D legend
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voxelLegendGroups } from "../src/lib/legendGroups.js";

const vox = (name, params) => ({ id: "m1", name, params, min: 0.01, max: 12.5, visible: true, cells: [{ value: 0.01 }, { value: 12.5 }], colorMode: "continuous", stops: [{ value: 0.01, color: "#000" }, { value: 12.5, color: "#fff" }] });

test("the block-model legend says the unit, g/t for gold in ppm", () => {
  const lab = (m) => voxelLegendGroups([m]).map((g) => g.label)[0];
  assert.match(lab(vox("Au estimate (idw2, 10m, r50m)", { element: "Au", unit: "ppm" })), /\(g\/t\)$/);
  assert.match(lab(vox("Cu estimate", { element: "Cu", unit: "ppm" })), /\(ppm\)$/);
  assert.equal(lab(vox("Resistivity", {})), "Resistivity");
  assert.equal(lab(vox("Au > 1 g/t shell (g/t)", { element: "Au", unit: "ppm" })), "Au > 1 g/t shell (g/t)", "not twice");
});

test("the shell run, the estimation result and grade-tonnage label with the display unit", () => {
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.ok(runs.includes("const unitL = gradeUnitLabel(symbol, unit);"));
  assert.ok(runs.includes("const label = `${symbol} > ${numericCutoff} ${unitL} shell`;"));
  assert.ok(runs.includes("capAudit(srcAssays, symbol, unit, elementUnits, numericCapValue), unitL)}"));
  const est = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  for (const s of ["unitLabel={gradeUnitLabel(symbol, unit)}", "gradeUnitLabel(symbol, result.params.capUnit)", "unit={gradeUnitLabel(symbol, unit) /* #2218: display only */}"]) assert.ok(est.includes(s), s);
  const gt = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.ok(gt.includes('tr("Cutoffs ({unit})", { unit: unitL || tr("no unit stated") })') && gt.includes('tr("cutoff ({unit})", { unit: unitL || "?" })'));
});

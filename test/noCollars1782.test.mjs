// TASKS.csv #1782 / #1865 / #1866 (review #1646, Kodiak) — a project with no collars: the level plan cuts its block models, a one-model
// section keeps the model's name above its key, and the Layout fit frames the block models
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelPlanZRange } from "../src/lib/viewer/levelPlanRange.js";
import { groupSectionLegend } from "../src/lib/sectionLegend.js";

test("#1782 the level plan's elevations: the holes, else the visible block models (cell faces), else nothing", () => {
  assert.deepEqual(levelPlanZRange([{ wz: [1000, 900, 800] }], [{ cells: [{ z: 2000, dz: 20, value: 1 }] }]), [800, 1000]);
  const m = { cells: [{ z: 820, dz: 20, value: 3 }, { z: 1740, dz: 20, value: 5 }, { z: 1760, dz: 20, value: NaN }] };
  assert.deepEqual(levelPlanZRange([], [m]), [810, 1750]);
  assert.equal(levelPlanZRange([], [{ ...m, visible: false }]), null);
  assert.equal(levelPlanZRange([], []), null);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("if (!levelPlanZRange(tracesRef.current, voxelModels))"));
  const w = readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.ok(w.includes("data.voxelSlices.forEach((v) => v.rects.forEach((r) => { add([r.x0, r.y0]); add([r.x1, r.y1]); }));"));
});

test("#1865 a lone model group keeps its heading; a lone category group stays bare; several groups all get one", () => {
  const one = groupSectionLegend([["3dmesh_utm — Chargeability (mV/V): -0.0354", "#440154"], ["3dmesh_utm — Chargeability (mV/V): 23.1", "#fde725"]]);
  assert.deepEqual(one[0], ["3dmesh_utm — Chargeability (mV/V)", null, { heading: true }]);
  assert.deepEqual(one.slice(1).map((r) => r[0]), ["-0.0354", "23.1"]);
  const unit = groupSectionLegend([["Cu (ppm): ≤ 100", "#aaa"]]);
  assert.equal(unit[0][2]?.heading, true, "a unit in the name: kept");
  const litho = groupSectionLegend([["Lithology: AND", "#0a0"], ["Lithology: DIO", "#00a"]]);
  assert.deepEqual(litho.map((r) => r[0]), ["AND", "DIO"]);
});

test("#1866 no holes: the fit frames the visible block models first, and the button says 'data'", () => {
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  const fit = l.slice(l.indexOf("const fitViewport = async"), l.indexOf("// TASKS.csv #906 — a resize handle"));
  assert.ok(fit.indexOf("modelFootprint(m)") > 0 && fit.indexOf("modelFootprint(m)") < fit.indexOf("for (const s of surfaceSamples"));
  assert.ok(l.includes('{hasHoles ? tr("Fit the holes at a round scale") : tr("Fit the data at a round scale")}'));
});

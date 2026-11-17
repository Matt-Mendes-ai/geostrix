// TASKS.csv #2640 Stage 2 — the structure fit's model as a new version: the fitted record becomes the specs of an ordinary model run (the same
// runSurfaceStack every stack goes through, so the result is added exactly as any run's), each surface '<name> (fitted)' beside the original.
// SYNTHETIC record only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fittedModelSpecs } from "../src/modules/viewer/modellingRuns.js";
import { recordWithFit, fitRows } from "../src/lib/structFit.js";

const O = { x: 500000, y: 5500000, z: 1000 };
const record = {
  at: "2026-11-17T00:00:00Z", tool: "Stratigraphic stack (UNIT_B, UNIT_C)", origin: O, relation: "onlap", packages: 2, extent: [0, 2000, 0, 2000, -1000, 0], resolution: [24, 24, 24],
  surfaces: [
    { name: "F1", meshName: "F1", fault: true, offsets: ["UNIT_B", "UNIT_C"], points: [{ x: O.x + 800, y: O.y + 900, z: O.z - 300, hole_id: null, nugget: null }], orientations: [{ x: O.x + 800, y: O.y + 900, z: O.z - 300, dip: 80, azimuth: 45 }] },
    { name: "Top of UNIT_B", meshName: "UNIT_B", package: 0, points: [{ x: O.x + 300, y: O.y + 500, z: O.z - 200, hole_id: "DH-23-001", nugget: null }, { x: O.x + 700, y: O.y + 500, z: O.z - 215, hole_id: null, nugget: 0.01 }], orientations: [{ x: O.x + 1000, y: O.y + 1000, z: O.z - 200, dip: 10, azimuth: 90 }] },
    { name: "Top of UNIT_C", meshName: "UNIT_C", package: 1, points: [{ x: O.x + 700, y: O.y + 500, z: O.z - 800, hole_id: null, nugget: null }], orientations: [{ x: O.x + 1000, y: O.y + 1000, z: O.z - 800, dip: 5, azimuth: 90 }] },
  ],
};

test("#2640 Stage 2 the fitted record as a run's specs: the run's frame, '(fitted)' names, the original codes, hole ids, packages, fault offsets", () => {
  const rows = fitRows({ points: [{ surface: "UNIT_B", index: 1, x: 700, y: 500, zStart: -215, z: -180, movedM: 35, maxM: 100, constrained: true }] }, record);
  const specs = fittedModelSpecs(recordWithFit(record, rows));
  assert.deepEqual(specs.map((s) => [s.label, s.meshName, s.codes[0]]), [["F1 (fitted)", "F1 (fitted)", "F1"], ["Top of UNIT_B (fitted)", "UNIT_B (fitted)", "UNIT_B"], ["Top of UNIT_C (fitted)", "UNIT_C (fitted)", "UNIT_C"]]);
  assert.deepEqual(specs[1].points[1], { x: 700, y: 500, z: -180, nugget: 0.01 }, "the fitted height, in the run's frame");
  assert.deepEqual(specs[1].points[0], { x: 300, y: 500, z: -200, hole_id: "DH-23-001" }, "a drillhole contact as it was, with its hole id");
  assert.deepEqual(specs[0].offsets, ["UNIT_B (fitted)", "UNIT_C (fitted)"], "the fault offsets the fitted surfaces");
  assert.equal(specs[0].fault, true); assert.equal(specs[1].type, "stratigraphic_contact");
  assert.deepEqual(specs.map((s) => s.package), [undefined, 0, 1]);
  assert.deepEqual(specs[2].orientations[0], { x: 1000, y: 1000, z: -800, dip: 5, azimuth: 90 });
});

test("#2640 Stage 2 wiring: runFittedModel goes through runSurfaceStack (every run's path, unchanged) with the record's relation and packages; the viewer takes the panel's request", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /const runFittedModel = async \(record\) => \{\n\s+if \(!record\?\.surfaces\?\.length\) return;\n\s+const specs = fittedModelSpecs\(record\);\n\s+await runSurfaceStack\(specs, \{ relation: record\.relation === "onlap" \? "onlap" : "erode", packages:/);
  assert.match(m, /runVeinModel, runFittedModel \/\* #2640 Stage 2 \*\/ \};/);
  const u = readFileSync(new URL("../src/modules/viewer/useModelling.js", import.meta.url), "utf8");
  assert.match(u, /useModuleAction\(\["run-fitted-model"\], \(_a, payload\) => \{ if \(payload\?\.record\) runs\.runFittedModel\(payload\.record\); \}\);/);
  const p = readFileSync(new URL("../src/components/StructFitPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /requestModuleAction\("run-fitted-model", \{ record: recordWithFit\(fit\.record \|\| record, fit\.rows\) \}\); goToModule\?\.\("viewer"\);/);
  assert.match(p, /\{tr\("Run the fitted model as a new version"\)\}/);
});

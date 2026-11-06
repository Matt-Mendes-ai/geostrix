// TASKS.csv #1978 — the true 3D inversion offers the Extrapolated voxel (the whole model to its depth) beside Observed, as the 2D lines do
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cells3d, voxel3dModels } from "../src/lib/dcip3d.js";

// one column of four 10 m cells: the top two seen by the data, the bottom two not; and one big padding cell
const result = { cells: {
  x: [5, 5, 5, 5, 200], y: [5, 5, 5, 5, 200], z: [-5, -15, -25, -35, -100],
  dx: [10, 10, 10, 10, 200], dy: [10, 10, 10, 10, 200], dz: [10, 10, 10, 10, 200],
  support: [0.5, 0.1, 0.004, 0.001, 0], resistivity: [100, 200, 300, 400, 999], chargeability: [1, 2, 3, 4, 5],
} };

test("cells3d all: every fine cell, no support cutoff, the padding still left out", () => {
  assert.deepEqual(cells3d(result, "resistivity", { cutoff: 0.02, maxCell: 20 }).map((c) => c.value), [100, 200]);
  const all = cells3d(result, "resistivity", { cutoff: 0.02, maxCell: 20, all: true });
  assert.deepEqual(all.map((c) => c.value), [100, 200, 300, 400]);
  assert.deepEqual(all.map((c) => c.support), [0.5, 0.1, 0.004, 0.001]); // each cell keeps its support
});

test("voxel3dModels: observed and extrapolated, named, see-through and honest about the extrapolation", () => {
  const fields = [["resistivity", "dc", "Resistivity (ohm·m)", "Resistivity (ohm·m) — 3D inversion (2 lines)"], ["chargeability", "ip", "Chargeability (mV/V)", "Chargeability (mV/V) — 3D inversion (2 lines)"]];
  const params = { tool: "3D", supportCutoff: 0.02, interpretation: "cut below the deepest seen cell" };
  const made = voxel3dModels(result, { cut: 0.02, maxCell: 20, kinds: ["observed", "extrapolated"], fields, params });
  assert.deepEqual(made.map((m) => `${m.field}/${m.kind}/${m.model.cells.length}`), ["resistivity/observed/2", "resistivity/extrapolated/4", "chargeability/observed/2", "chargeability/extrapolated/4"]);
  const [obs, ext] = made;
  assert.equal(obs.model.name, "Resistivity (ohm·m) — 3D inversion (2 lines)");
  assert.equal(ext.model.name, "Resistivity (ohm·m) — 3D inversion (2 lines), extrapolated to the model depth");
  assert.equal(obs.model.opacity, 0.85); assert.equal(ext.model.opacity, 0.6);
  assert.equal(obs.model.supportCutoff, 0.02); assert.equal(ext.model.supportCutoff, 0);
  assert.equal(obs.model.params.interpretation, params.interpretation);
  assert.match(ext.model.params.interpretation, /extrapolation, a prediction to test, not a measurement/);
  assert.equal(ext.model.params.supportCutoff, 0);
  assert.equal(ext.model.method, "dc-3d");
  assert.deepEqual(voxel3dModels(result, { cut: 0.02, maxCell: 20, fields, params }).map((m) => m.kind), ["observed", "observed"]); // the default: as before
});

test("both 3D panels offer the choice and use it", () => {
  const p = readFileSync(new URL("../src/components/Dcip3dPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const a = readFileSync(new URL("../src/components/Dcip3dArrayPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /export function VoxelChoice\(/);
  assert.match(p, /Extrapolated \(the whole model, to its depth\)/);
  for (const s of [p, a]) {
    assert.match(s, /<VoxelChoice o=\{o\} setO=\{setO\}/);
    assert.match(s, /voxel3dModels\(result, \{ cut, maxCell, kinds: voxKinds\(o\)/);
    assert.match(s, /voxObserved: true, voxExtrapolated: false/);
    assert.match(s, /if \(!voxKinds\(o\)\.length\) p\.push/);
  }
});

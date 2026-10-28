// TASKS.csv #1050 — VTK and OMF block-model exports carry the per-block fields the CSV does
import test from "node:test";
import assert from "node:assert/strict";
import { blockModelToVtk } from "../src/lib/vtkExport.js";
import { volumeElementFromModel } from "../src/lib/omfWriter.js";
import { numericCellFields } from "../src/lib/blockModelExport.js";

const cell = (x, extra) => ({ x, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: x / 10, ...extra });
const est = { name: "Au OK", source: "estimate-ok", params: { element: "Au", unit: "ppm" }, cells: [
  cell(5, { nSamples: 12, nHoles: 3, support: "interpolated", supportIndex: 0.8, kv: 0.01, nearestSampleM: 7 }),
  cell(15, { nSamples: 4, nHoles: 1, support: "extrapolated", supportIndex: 0.2, kv: 0.3, nearestSampleM: 40 })] };
const merged = { name: "imported", source: "import", property: "AU", cells: [cell(5, { coverage: 0.0417 }), cell(15, { coverage: 1 })] };
const text = (b) => new TextDecoder("latin1").decode(b);

test("#1050 numericCellFields lists only the fields the cells carry", () => {
  assert.deepEqual(numericCellFields(est.cells).map((f) => f.name), ["N_SAMPLES", "N_HOLES", "SUPPORT_CODE", "SUPPORT_INDEX", "KV", "NEAREST_M"]);
  assert.deepEqual(numericCellFields(merged.cells).map((f) => f.name), ["COVERAGE"]);
});

test("#1050 VTK: the value named Au_ppm, and the other fields as further CELL_DATA arrays", () => {
  const t = text(blockModelToVtk(est).bytes);
  assert.match(t, /SCALARS Au_ppm float 1/);
  for (const n of ["N_SAMPLES", "N_HOLES", "SUPPORT_CODE", "SUPPORT_INDEX", "KV", "NEAREST_M"]) assert.match(t, new RegExp(`SCALARS ${n} float 1`));
  assert.equal((t.match(/CELL_DATA/g) || []).length, 1);
  assert.match(text(blockModelToVtk(merged).bytes), /SCALARS AU float 1[\s\S]*SCALARS COVERAGE float 1/);
});

test("#1050 OMF: coverage, kv and the counts as data arrays, support kept under its old names", () => {
  const names = volumeElementFromModel(est).element.data.map((d) => d.name);
  assert.deepEqual(names, ["Au_ppm", "support", "support_index", "n_samples", "n_holes", "kv", "nearest_m"]);
  const m = volumeElementFromModel(merged).element.data;
  const cov = m.find((d) => d.name === "coverage");
  assert.ok(cov && [...cov.values].filter(Number.isFinite).sort().join() === [0.0417, 1].sort().join());
});

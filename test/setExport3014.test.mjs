// TASKS.csv #3014 part c — a set member exported "with the other elements of its set": one value column per other member (CSV), one array (VTK, OMF),
// joined on the lattice, empty where that member has no block; off by default, so an export keeps its shape. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withSetColumns, setRecord } from "../src/lib/estimateSet.js";
import { blockModelRows, blockModelCsvChunks, blockModelParamLines } from "../src/lib/blockModelExport.js";
import { blockModelToVtk } from "../src/lib/vtkExport.js";
import { volumeElementFromModel } from "../src/lib/omfWriter.js";

const set = setRecord("set-x", "Fe", ["SiO2", "Al2O3"]);
const cell = (x, value) => ({ x, y: 5, z: 2.5, dx: 10, dy: 10, dz: 5, value, nSamples: 4, nHoles: 2 });
const fe = { id: "a", name: "Fe estimate (set: Fe, SiO2, Al2O3)", params: { element: "Fe", unit: "%", set }, cells: [cell(5, 62), cell(15, 60), cell(25, 58)] };
const si = { id: "b", name: "SiO2 estimate (set: Fe, SiO2, Al2O3)", params: { element: "SiO2", unit: "%", set }, cells: [cell(5, 3), cell(25, 2)] }; // no block at x = 15
const al = { id: "c", name: "Al2O3 estimate (set: Fe, SiO2, Al2O3)", params: { element: "Al2O3", unit: "%", set }, cells: [cell(5, 1.5), cell(15, 2), cell(25, 2.5)] };
const other = { id: "d", name: "Au estimate", params: { element: "Au", unit: "ppm" }, cells: [cell(5, 1)] };
const models = [fe, si, al, other];

test("a model with no set, or whose members are gone, exports as it is", () => {
  assert.equal(withSetColumns(other, models), other);
  assert.equal(withSetColumns(fe, [fe, other]), fe);
});

test("the set's other elements become value columns on the same blocks, empty where a member has no block", () => {
  const m = withSetColumns(fe, models);
  assert.notEqual(m, fe);
  assert.equal(fe.exportExtra, undefined, "the stored model is untouched");
  assert.deepEqual(m.exportExtra.map((e) => e.name), ["SiO2_pct", "Al2O3_pct"]);
  assert.deepEqual(fe.cells.map((c) => m.exportExtra[0].get(c)), [3, null, 2]);
  assert.match(m.exportExtraNote, /^Set: Fe, SiO2, Al2O3 \(one estimate, the same blocks\): SiO2_pct from "SiO2 estimate/);
  assert.ok(blockModelParamLines(m).includes(m.exportExtraNote));
});

test("CSV: the columns follow the value in both writers, which agree; without the option the header is as before", () => {
  const m = withSetColumns(fe, models);
  const text = [...blockModelCsvChunks(m)].join("\r\n").split("\r\n");
  assert.deepEqual(text[0].split(",").slice(0, 9), ["XC", "YC", "ZC", "XINC", "YINC", "ZINC", "Fe_pct", "SiO2_pct", "Al2O3_pct"]);
  assert.deepEqual(text.slice(1).map((l) => l.split(",").slice(6, 9)), [["62", "3", "1.5"], ["60", "", "2"], ["58", "2", "2.5"]]);
  const rows = blockModelRows(m);
  assert.deepEqual(rows.map((r) => [r.Fe_pct, r.SiO2_pct, r.Al2O3_pct]), [[62, 3, 1.5], [60, null, 2], [58, 2, 2.5]]);
  assert.equal([...blockModelCsvChunks(fe)].join("").split("\r\n")[0].includes("SiO2_pct"), false);
  assert.equal(blockModelRows(m, "micromine")[0].SiO2_pct, 3);
});

test("VTK and OMF carry one array per member", () => {
  const m = withSetColumns(fe, models);
  const vtk = new TextDecoder("latin1").decode(blockModelToVtk(m).bytes);
  assert.match(vtk, /SCALARS SiO2_pct float/);
  assert.match(vtk, /SCALARS Al2O3_pct float/);
  assert.doesNotMatch(new TextDecoder("latin1").decode(blockModelToVtk(fe).bytes), /SiO2_pct/);
  const ve = volumeElementFromModel(m);
  assert.ok(!ve.error, ve.error);
  const names = ve.element.data.map((d) => d.name);
  assert.ok(names.includes("sio2_pct") && names.includes("al2o3_pct"), names.join(", "));
  const s = ve.element.data.find((d) => d.name === "sio2_pct").values;
  assert.deepEqual([...s].map((v) => (Number.isNaN(v) ? null : v)).filter((v) => v !== null).sort(), [2, 3]);
});

test("two members of one element keep apart", () => {
  const si2 = { ...si, id: "e", name: "SiO2 estimate again" };
  const m = withSetColumns(fe, [fe, si, si2]);
  assert.deepEqual(m.exportExtra.map((e) => e.name), ["SiO2_pct", "SiO2_pct_2"]);
});

test("Geophysics' block models: the option, off by default, reaches the CSV, VTK and package exports", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /localStorage\.getItem\("geostrix\.blockExportWithSet"\) === "1"/);
  assert.match(g, /exportBlockModelCSV\(withSet \? withSetColumns\(model, others\) : model,/);
  assert.match(g, /exportBlockModelVTK\(withSet \? withSetColumns\(model, others\) : model,/);
  assert.match(g, /buildModelExportZip\(bmWithSet \? withSetColumns\(model, voxelModels\) : model, epsg\)/);
  assert.match(readFileSync(new URL("../src/lib/modelExport.js", import.meta.url), "utf8"), /if \(model\.exportExtraNote\) notes\.push/);
});

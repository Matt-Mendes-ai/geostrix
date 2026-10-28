// TASKS.csv #1044 — a vector (MVI) inversion's direction reaches every export
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModelExportZip } from "../src/lib/modelExport.js";
import { readZipEntries } from "../src/lib/shapefile.js";
import { blockModelRows, blockModelCsvTextSync, blockModelParamLines } from "../src/lib/blockModelExport.js";
import { toExportCsv } from "../src/lib/tabular.js";
import { blockModelToVtk } from "../src/lib/vtkExport.js";
import { volumeElementFromModel } from "../src/lib/omfWriter.js";

const cells = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) cells.push({ x: 25 + 50 * i, y: 25 + 50 * j, z: 875 + 50 * k, dx: 50, dy: 50, dz: 50, value: 0.01 * (i + j + k + 1), support: 0.5, inc: 60 + i, dec: 10 * j });
const model = { name: "MVI test", source: "simpeg", style: "vector", cells, params: {} };

test("#1044 block-model CSV: INC_DEG / DEC_GRID_DEG columns, explained in the header", () => {
  const rows = blockModelRows(model);
  assert.deepEqual([rows[0].INC_DEG, rows[0].DEC_GRID_DEG], [60, 0]);
  assert.equal(blockModelCsvTextSync(model), toExportCsv(rows));
  assert.match(blockModelParamLines(model).join("\n"), /INC_DEG \/ DEC_GRID_DEG: .*positive down.*GRID north/);
});

test("#1044 VTK and OMF carry the direction (and the VTK the support)", () => {
  const t = new TextDecoder("latin1").decode(blockModelToVtk(model).bytes);
  for (const n of ["SUPPORT", "INC_DEG", "DEC_GRID_DEG"]) assert.match(t, new RegExp(`SCALARS ${n} float 1`));
  const names = volumeElementFromModel(model).element.data.map((d) => d.name);
  assert.ok(names.includes("inc_deg") && names.includes("dec_grid_deg"), names.join());
});

test("#1044 the UBC zip has _inc.mod / _dec.mod, and the provenance names them", async () => {
  const r = await buildModelExportZip(model, 3156);
  assert.ok(r.files.some((f) => /_inc\.mod$/.test(f)) && r.files.some((f) => /_dec\.mod$/.test(f)), r.files.join());
  const e = await readZipEntries(r.zip, /./);
  const prov = new TextDecoder().decode(e["provenance.txt"]);
  const inc = new TextDecoder().decode(e["MVI_test_inc.mod"]).trim().split(/\s+/).map(Number);
  assert.equal(inc.length, 12);
  assert.ok(inc.every((v) => v >= 60 && v <= 62), inc.join());
  assert.match(prov, /_inc\.mod \/ _dec\.mod/);
});

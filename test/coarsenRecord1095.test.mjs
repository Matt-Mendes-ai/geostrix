// TASKS.csv #1095 — a model block-averaged on import says so in its exports, and its depth slices are written even
// though the last column / row of the averaged grid is narrower
import { test } from "node:test";
import assert from "node:assert/strict";
import { coarsenRecord } from "../src/lib/voxel.js";
import { coarsenedText, blockModelParamLines } from "../src/lib/blockModelExport.js";
import { tensorFromCells, depthSliceTiffs, provenanceText } from "../src/lib/modelExport.js";

test("the record: shape, factors, counts and the fine range with no-data left out", () => {
  const c = coarsenRecord({ shape: [10, 10, 4], factors: [3, 3, 2], cellsTo: 64, values: [-1e30, 0.5, 1.0, 9e-5, NaN], valid: (v) => Number.isFinite(v) && v > -99999 });
  assert.deepEqual([c.cellsFrom, c.cellsTo, c.fineMin, c.fineMax], [400, 64, 9e-5, 1.0]);
  const t = coarsenedText(c);
  assert.match(t, /^Block-averaged on import: 10 x 10 x 4 cells \(400\) merged 3 x 3 x 2 into 64/);
  assert.match(t, /ran 0\.00009 to 1, and peaks are lower here/);
  assert.equal(coarsenedText(null), null);
});

const cell = (x, y, z, dx, dy, dz, value) => ({ x, y, z, dx, dy, dz, value });
// a 3 x 2 x 1 grid whose last column (x) and last row (y) are narrower: 100, 100, 50 by 100, 60
const cells = [];
for (const [x, dx] of [[50, 100], [150, 100], [225, 50]]) for (const [y, dy] of [[50, 100], [130, 60]]) cells.push(cell(x, y, -50, dx, dy, 100, x + y));
const model = { name: "ZTEM (m)", source: "omf", cells, params: { coarsenedFrom: coarsenRecord({ shape: [30, 16, 2], factors: [10, 10, 2], cellsTo: 6, values: [0.001, 2], valid: Number.isFinite }) } };

test("depth slices accept a narrower last column and row; the pixel grid's top edge and the overhang are stated", () => {
  const t = tensorFromCells(cells);
  const s = depthSliceTiffs(cells, t, 32610);
  assert.ok(!s.error, s.error);
  assert.deepEqual(s.pixel, [100, 100]);
  assert.deepEqual(s.overhang, [50, 40]);
  assert.equal(s.files.length, 1);
  // a grid narrower in the MIDDLE is still refused
  const mid = cells.map((c) => (c.x === 150 ? { ...c, dx: 40, x: 120 } : c.x === 225 ? { ...c, x: 165 } : c));
  assert.match(depthSliceTiffs(mid, tensorFromCells(mid), 32610).error || "", /equal cell widths/);
});

test("provenance.txt and the CSV header state the averaging; an imported model's empty params say so; no runs of blank lines", () => {
  const t = tensorFromCells(cells);
  const txt = provenanceText(model, t, ["a.msh"], 32610, []);
  assert.match(txt, /Block-averaged on import: 30 x 16 x 2 cells/);
  assert.ok(!/\n\n\n/.test(txt), "no runs of blank lines");
  const bare = provenanceText({ name: "M", source: "omf", cells }, t, ["a.msh"], 32610, []);
  assert.match(bare, /Nothing recorded: the model was imported from a file/);
  assert.ok(blockModelParamLines(model).some((l) => l.startsWith("Block-averaged on import")));
});

test("the raster GeoTIFF export says what it holds: the kept size, the averaging and the filter", async () => {
  const { rasterExportNote } = await import("../src/lib/gridExport.js");
  const t = rasterExportNote({ name: "Mag — First vertical derivative", grid: { nx: 512, ny: 400, dx: 25, averagedBy: 3, sourceSize: [1536, 1200] }, filter: { label: "First vertical derivative", sourceRaster: "Mag", params: { order: 1, nested: { a: 1 } } } });
  assert.match(t, /512 × 400 values at 25 m/);
  assert.match(t, /block-averaged 3 × 3 from the 1536 × 1200 source grid/);
  assert.match(t, /Made by First vertical derivative from "Mag" \(order 1\)\./);
  assert.ok(!/averaged/.test(rasterExportNote({ name: "G", grid: { nx: 10, ny: 10, dx: 5, averagedBy: 1 } })));
});

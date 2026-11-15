// TASKS.csv #3297 — the density kept with the block model is written per block by every export
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { blockModelRows, blockModelCsvTextSync, numericCellFields } from "../src/lib/blockModelExport.js";

const model = { name: "m", source: "estimate-nn", params: { element: "Fe", unit: "%" }, cells: [
  { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 5, value: 55, density: 2.25 },
  { x: 10, y: 0, z: 0, dx: 10, dy: 10, dz: 5, value: 40, density: 3.123456 },
] };
test("a DENSITY column in the rows, the CSV text and the numeric fields", () => {
  const rows = blockModelRows(model);
  assert.deepEqual(rows.map((r) => r.DENSITY), [2.25, 3.123]);
  const lines = blockModelCsvTextSync(model).split("\r\n");
  const head = lines[0].split(",");
  const k = head.indexOf("DENSITY");
  assert.ok(k > 6, `header ${lines[0]}`);
  assert.deepEqual(lines.slice(1).map((l) => l.split(",")[k]), ["2.25", "3.123"]);
  assert.ok(numericCellFields(model.cells).some((f) => f.name === "DENSITY"));
  // tonnes agree: volume x density per block
  const t = model.cells.reduce((s, c) => s + c.dx * c.dy * c.dz * c.density, 0);
  assert.equal(Math.round(t), Math.round(500 * 2.25 + 500 * 3.123456));
});
test("no density, no column", () => {
  const m = { ...model, cells: model.cells.map(({ density, ...c }) => c) };
  assert.ok(!blockModelCsvTextSync(m).split("\r\n")[0].includes("DENSITY"));
});
test("wiring in Grade-tonnage", () => {
  const s = fs.readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /updateVoxelModel\(model\.id, \{ cells, params/);
});

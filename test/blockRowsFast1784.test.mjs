// TASKS.csv #1784 — blockModelCellsFromRows in one typed pass: same cells, bad-row count, air and inferred widths
import { test } from "node:test";
import assert from "node:assert/strict";
import { blockModelCellsFromRows } from "../src/lib/blockModelCsv.js";

test("bad rows, air and sizes: given where present, inferred where not", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) for (let k = 0; k < 4; k++) rows.push({ X: String(100 + 10 * i), Y: "500", Z: String(20 * k), DX: i === 3 ? "5" : "", V: k === 3 ? "-1" : String(i + k) });
  rows.push({ X: "", Y: "500", Z: "0", DX: "", V: "1" }, { X: "1", Y: "500", Z: "0", DX: "", V: "NA" });
  const r = blockModelCellsFromRows(rows, { x: "X", y: "Y", z: "Z", dx: "DX" }, "V");
  assert.equal(r.badRows, 2);
  assert.deepEqual(r.air, { count: 10, value: -1 }, "the -1 top layer is air (25 % of the blocks, the only negatives)");
  assert.equal(r.cells.length, 30);
  assert.ok(r.cells.every((c) => c.value >= 0 && c.z < 60));
  assert.equal(r.cells.find((c) => c.x === 130).dx, 5, "a given size is kept");
  assert.equal(r.cells.find((c) => c.x === 140).dx, 10, "a missing one is inferred from the centroids");
  assert.equal(r.cells[0].dz, 20);
  assert.equal(r.inferred.dz.min, 20);
});

test("no attribute: every row is bad", () => {
  const r = blockModelCellsFromRows([{ X: "1", Y: "2", Z: "3" }], { x: "X", y: "Y", z: "Z" }, null);
  assert.equal(r.cells.length, 0); assert.equal(r.badRows, 1); assert.equal(r.air, null);
});

// TASKS.csv #661 — the worker's typed-column result rebuilds exactly the cells the object path makes
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { cellsFromColumns, columnBuffers } from "../src/lib/estimationCells.js";

const pts = [];
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let h = 0; h < 12; h++) for (let i = 0; i < 40; i++) pts.push({ x: (h % 4) * 40 + rnd() * 5, y: Math.floor(h / 4) * 40, z: -2 * i, value: rnd() * 10, hole_id: `H${h}`, length: 2 });
const base = { bounds: { xmin: -10, xmax: 140, ymin: -10, ymax: 90, zmin: -82, zmax: 2 }, cellSize: { dx: 6, dy: 6, dz: 6 }, searchRadius: 45, minSamples: 1, maxSamples: 12 };

for (const [label, extra] of [["plain", { method: "idw2" }], ["support", { method: "idw2", support: true }], ["nn + 2 holes", { method: "nn", minHoles: 2 }], ["mls", { method: "mls1", support: true }]]) {
  test(`columns == objects (${label})`, () => {
    const obj = estimateBlockModel(pts, { ...base, ...extra });
    const col = estimateBlockModel(pts, { ...base, ...extra, columns: true });
    assert.ok(!col.cells && col.columns && obj.cells.length > 100);
    assert.equal(col.blocksEstimated, obj.blocksEstimated);
    assert.deepEqual(cellsFromColumns(col.columns), obj.cells);
    const { columns: _c, ...colRest } = col, { cells: _o, ...objRest } = obj;
    assert.deepEqual(colRest, objRest); // every summary figure the same
    assert.equal(col.columns.x.length, col.columns.n, "trimmed to the estimated blocks");
    assert.ok(columnBuffers(col.columns).every((b) => b instanceof ArrayBuffer));
  });
}

// TASKS.csv #1617 (review #1497, Lawyers) — the pit's 'ore from one hole' counts the blocks the estimate itself called single-hole:
// one hole carrying at least 95 % of the weight (#676), stored per block as holeShare, beside the blocks estimated from one hole
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel, DOMINANT_SHARE } from "../src/lib/estimation.js";
import { cellsFromColumns } from "../src/lib/estimationCells.js";
import { ONE_HOLE_SHARE, oneHoleBlock, buildPitGrid, pitEconomics, pitSummary, solvePit } from "../src/lib/pitShell.js";
import { blockModelRows } from "../src/lib/blockModelExport.js";

test("the pit's threshold is the estimate's", () => {
  assert.equal(ONE_HOLE_SHARE, DOMINANT_SHARE);
  assert.equal(oneHoleBlock({ nHoles: 1 }), true);
  assert.equal(oneHoleBlock({ nHoles: 2, holeShare: 0.97 }), true);
  assert.equal(oneHoleBlock({ nHoles: 2, holeShare: 0.6 }), false);
  assert.equal(oneHoleBlock({ nHoles: 3 }), false);
});

test("the estimate stores each block's dominant-hole share, as cells and as columns", () => {
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({ x: 1, y: 0, z: -2 * i - 1, value: 100, hole_id: "A", length: 2 });
  for (let i = 0; i < 60; i++) pts.push({ x: 60, y: 0, z: -2 * i - 1, value: 300, hole_id: "B", length: 2 });
  const opts = { bounds: { xmin: -1, xmax: 1, ymin: -1, ymax: 1, zmin: -61, zmax: -59 }, cellSize: { dx: 2, dy: 2, dz: 2 }, method: "idw2", searchRadius: 100, minSamples: 1, maxSamples: 16, minHoles: 2 };
  const res = estimateBlockModel(pts, opts);
  assert.equal(res.dominatedCells, 1);
  assert.ok(res.cells[0].holeShare >= DOMINANT_SHARE, String(res.cells[0].holeShare));
  const cols = estimateBlockModel(pts, { ...opts, columns: true });
  const cells = cellsFromColumns(cols.columns);
  assert.ok(Math.abs(cells[0].holeShare - res.cells[0].holeShare) < 1e-6);
  // halfway between the holes: a share well under the threshold
  const mid = estimateBlockModel(pts, { ...opts, bounds: { xmin: 29.5, xmax: 31.5, ymin: -1, ymax: 1, zmin: -61, zmax: -59 } });
  assert.ok(mid.cells[0].holeShare < 0.7 && mid.cells[0].holeShare >= 0.5);
  // a one-hole block carries 1
  const one = estimateBlockModel(pts, { ...opts, minHoles: 1, searchRadius: 20 });
  assert.equal(one.cells[0].nHoles, 1);
  assert.equal(one.cells[0].holeShare, 1);
  // the share leaves in the export rows
  const row = blockModelRows({ cells: res.cells, params: { element: "Cu", unit: "ppm" } })[0];
  assert.ok(row.HOLE_SHARE >= 0.95);
});

test("the pit counts a 95 %-weight block as one hole's ore", () => {
  const cells = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 5, dx: 10, dy: 10, dz: 10, value: 5, nHoles: 2, holeShare: i === 0 ? 0.97 : 0.6 });
  const e = pitEconomics({ unit: "g/t", element: "Au", price: 1800, priceUnit: "oz", recovery: 90, processingCost: 20 });
  const g = buildPitGrid(cells, { slopeDeg: 45, density: 2.7, economics: e, miningCost: 3, processingCost: 20 });
  const s = pitSummary(g, solvePit(g, 45).mined);
  assert.ok(s.oreT > 0);
  assert.ok(Math.abs(s.oreSingleHoleShare - 1 / 3) < 1e-6, String(s.oreSingleHoleShare)); // the west column of three
});

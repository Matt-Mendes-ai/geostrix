// TASKS.csv #625 — the grade shell's block budget: sizing helpers and the estimator honouring maxBlocks.
import test from "node:test";
import assert from "node:assert/strict";
import { gridBlockCount, cellToFit, MAX_BLOCKS, MAX_BLOCK_BUDGET } from "../src/lib/estimationMeta.js";
import { estimateDenseGrid } from "../src/lib/estimation.js";

// Matt's case: 528 x 455 x 233 blocks at 10 m
const box = { xmin: 0, xmax: 5280, ymin: 0, ymax: 4550, zmin: 0, zmax: 2330 };

test("#625 block count and the smallest cell that fits a budget", () => {
  assert.equal(gridBlockCount(box, 10), 55975920);
  const fit = cellToFit(box, MAX_BLOCK_BUDGET, 10);
  assert.ok(gridBlockCount(box, fit) <= MAX_BLOCK_BUDGET && gridBlockCount(box, fit - 0.5) > MAX_BLOCK_BUDGET, `fit ${fit}`);
  assert.ok(fit >= 22 && fit <= 24, `fit ${fit}`); // ~23 m for 5 M blocks
  const fitDefault = cellToFit(box, MAX_BLOCKS, 10);
  assert.ok(gridBlockCount(box, fitDefault) <= MAX_BLOCKS && fitDefault > 60);
});

test("#625 the estimator honours maxBlocks (default 200,000; never above 5 M)", () => {
  const pts = [{ x: 50, y: 50, z: 50, value: 1, hole_id: "A" }];
  const b = { xmin: 0, xmax: 300, ymin: 0, ymax: 300, zmin: 0, zmax: 300 }; // 300^3 at 1 m = 27 M; at 5 m = 216,000
  assert.throws(() => estimateDenseGrid(pts, { bounds: b, cellSize: { dx: 5, dy: 5, dz: 5 }, searchRadius: 10 }), /200,000-block limit/);
  const g = estimateDenseGrid(pts, { bounds: b, cellSize: { dx: 5, dy: 5, dz: 5 }, searchRadius: 10, maxBlocks: 1000000 });
  assert.equal(g.nx * g.ny * g.nz, 216000);
  assert.throws(() => estimateDenseGrid(pts, { bounds: b, cellSize: { dx: 1.5, dy: 1.5, dz: 1.5 }, searchRadius: 10, maxBlocks: 1e9 }), /5,000,000-block limit/);
});

import { estimateBlockModel } from "../src/lib/estimation.js";
test("#626 the block-model estimate honours maxBlocks too", () => {
  const pts = [{ x: 50, y: 50, z: 50, value: 1, hole_id: "A" }];
  const b = { xmin: 0, xmax: 300, ymin: 0, ymax: 300, zmin: 0, zmax: 300 };
  assert.throws(() => estimateBlockModel(pts, { bounds: b, cellSize: { dx: 5, dy: 5, dz: 5 }, searchRadius: 10 }), /200,000-block limit/);
  const r = estimateBlockModel(pts, { bounds: b, cellSize: { dx: 5, dy: 5, dz: 5 }, searchRadius: 10, maxBlocks: 1000000 });
  assert.equal(r.grid.nx * r.grid.ny * r.grid.nz, 216000);
  assert.ok(r.blocksEstimated > 0);
});

// TASKS.csv #661 — block models (one object per block, held twice) stop at 1 million; the grade shell's grid keeps 5 million
test("#661 block-model budgets stop at 1 million; the grade shell keeps the larger ones", async () => {
  const { BLOCK_MODEL_BUDGETS, MAX_BLOCK_MODEL_BUDGET, BLOCK_BUDGETS } = await import("../src/lib/estimationMeta.js");
  assert.equal(MAX_BLOCK_MODEL_BUDGET, 1000000);
  assert.equal(Math.max(...BLOCK_MODEL_BUDGETS), MAX_BLOCK_MODEL_BUDGET);
  assert.equal(Math.max(...BLOCK_BUDGETS), MAX_BLOCK_BUDGET);
});

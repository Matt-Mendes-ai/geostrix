// TASKS.csv #1074 — the 3D view cell budget is clamped to the block-model ceiling
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCellBudget, MAX_BLOCK_MODEL_BUDGET, MIN_CELL_BUDGET } from "../src/lib/estimationMeta.js";

test("#1074 cell budget: one extra zero stops at 2 million; empty / zero / text fall back to the default", () => {
  assert.equal(clampCellBudget(10000000), MAX_BLOCK_MODEL_BUDGET);
  assert.equal(clampCellBudget(250000), 250000);
  assert.equal(clampCellBudget(5), MIN_CELL_BUDGET);
  for (const v of [0, -3, NaN, null, undefined, Infinity]) assert.equal(clampCellBudget(v), null);
});

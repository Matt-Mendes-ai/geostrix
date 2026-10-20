// TASKS.csv #741 — the add-on's block result -> voxel cells: the contract check, the cell shape and the P90 - P10 spread.
import test from "node:test";
import assert from "node:assert/strict";
import { checkBlocks, blockPoints, blockCells, clipBlocks } from "../src/lib/geomlClip.js";

// three blocks: one above the ground, one far from the data, one kept
const blocks = { cell: 25, x: [0, 5000, 100], y: [0, 5000, 100], z: [900, 400, 400], prediction: [1, 2, 3], p10: [0.5, 1, 2], p90: [1.5, 4, 5] };
const ground = () => 500, near = (x) => x < 1000;

test("the kept block becomes a cell of the block size, and its spread is P90 - P10", () => {
  assert.equal(checkBlocks(blocks, ["prediction"]), 3);
  const r = clipBlocks(blockPoints(blocks), { ground, near });
  assert.deepEqual([r.keep, r.air, r.far], [[false, false, true], 1, 1]);
  assert.deepEqual(blockCells(blocks, r.keep, (i) => blocks.prediction[i]), [{ x: 100, y: 100, z: 400, dx: 25, dy: 25, dz: 25, value: 3 }]);
  assert.deepEqual(blockCells(blocks, r.keep, (i) => blocks.p90[i] - blocks.p10[i]).map((c) => c.value), [3]);
});

test("a non-finite value is left out; a result of the wrong shape is refused with a plain message", () => {
  assert.deepEqual(blockCells({ ...blocks, prediction: [1, 2, NaN] }, [true, true, true], (i) => [1, 2, NaN][i]).map((c) => c.value), [1, 2]);
  assert.throws(() => checkBlocks({ ...blocks, prediction: [1, 2] }, ["prediction"]), /cannot read.*equal length/);
  assert.throws(() => checkBlocks({ ...blocks, cell: undefined }, ["prediction"]), /cannot read/);
  assert.throws(() => checkBlocks(undefined, ["probability"]), /cannot read/);
});

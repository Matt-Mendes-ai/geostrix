// TASKS.csv #757 — per-cell unit probability, information entropy and per-run volumes from an ensemble of blocks
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEnsembleCounter, quantile, gridValuesToCells } from "../src/lib/ensembleProbability.js";

test("probability and entropy per cell", () => {
  const c = makeEnsembleCounter(3, 2);
  // cell 0 always unit 2, cell 1 half / half, cell 2 three of four unit 1
  [[2, 1, 1], [2, 2, 1], [2, 1, 1], [2, 2, 2]].forEach((ids) => assert.ok(c.add(ids)));
  assert.equal(c.add([1, 1]), false); // wrong length is refused
  const r = c.result();
  assert.equal(r.runs, 4);
  assert.deepEqual([...r.prob[1]], [1, 0.5, 0.25]);
  assert.equal(r.entropy[0], 0);
  assert.ok(Math.abs(r.entropy[1] - 1) < 1e-6);
  assert.ok(Math.abs(r.entropy[2] - (-(0.75 * Math.log2(0.75) + 0.25 * Math.log2(0.25)))) < 1e-6);
  assert.deepEqual(r.volumesCells.map((v) => v[1]), [1, 2, 1, 3]);
});

test("quantiles", () => {
  assert.equal(quantile([3, 1, 2], 0.5), 2);
  assert.equal(quantile([0, 10], 0.9), 9);
  assert.ok(Number.isNaN(quantile([], 0.5))); // #1114 — arrayStats.js quantileLinear: NaN when empty
});

test("grid values to world cells, with a keep rule and a trend index map", () => {
  const cells = gridValuesToCells([0, 20, 0, 10, 0, 10], [2, 1, 1], [0, 0.7], { x: 100, y: 0, z: 0 }, (v) => v > 0);
  assert.equal(cells.length, 1); assert.equal(cells[0].x, 115); assert.equal(cells[0].value, 0.7);
  const mapped = gridValuesToCells([0, 20, 0, 10, 0, 10], [2, 1, 1], [0.3, 0.9], undefined, () => true, Int32Array.from([2, 0]));
  assert.equal(mapped.length, 1); assert.equal(mapped[0].value, 0.9);
});

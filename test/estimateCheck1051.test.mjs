// TASKS.csv #1051 — the estimate checked against its composites and a nearest-neighbour model over the same blocks
import { test } from "node:test";
import assert from "node:assert/strict";
import { compositeMean, estimateCheck, swath } from "../src/lib/estimateCheck.js";
import { estimateBlockModel } from "../src/lib/estimation.js";

const cell = (x, y, z, value) => ({ x, y, z, dx: 10, dy: 10, dz: 10, value });

test("composite mean is length-weighted", () => {
  assert.equal(compositeMean([{ value: 1, length: 3 }, { value: 5, length: 1 }]), 2);
  assert.equal(compositeMean([{ value: 1 }, { value: 5 }]), 3); // no length: counted once each
  assert.equal(compositeMean([]), null);
});

test("block means are over the blocks both models filled; departure is against NN", () => {
  const est = [cell(5, 5, 5, 2), cell(15, 5, 5, 4), cell(25, 5, 5, 9)];
  const nn = [cell(5, 5, 5, 1), cell(15, 5, 5, 3)]; // the third block has no NN value: left out of all block means
  const r = estimateCheck(est, nn, [{ value: 4, length: 2 }, { value: 1, length: 2 }]);
  assert.equal(r.estimate.n, 2);
  assert.equal(r.estimate.mean, 3);
  assert.equal(r.nn.mean, 2);
  assert.equal(r.departPct, 50);
  assert.equal(r.composites.mean, 2.5);
  assert.equal(r.nnVsCompositesPct, 25);
});

test("clustered drilling: the composite mean overstates the declustered (NN) mean", () => {
  // 20 composites at high grade packed around x = 5, two lonely low-grade ones further along
  const pts = [];
  for (let i = 0; i < 20; i++) pts.push({ x: 5 + i * 0.1, y: 5, z: 5, value: 10, hole_id: `A${i % 4}`, length: 1 });
  pts.push({ x: 45, y: 5, z: 5, value: 1, hole_id: "B", length: 1 }, { x: 85, y: 5, z: 5, value: 1, hole_id: "C", length: 1 });
  const bounds = { xmin: 0, xmax: 90, ymin: 0, ymax: 10, zmin: 0, zmax: 10 };
  const nn = estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "nn", searchRadius: 200, maxSamples: 1 });
  const idw = estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "idw2", searchRadius: 200, maxSamples: 8 });
  const r = estimateCheck(idw.cells, nn.cells, pts);
  assert.equal(r.estimate.n, 9);
  assert.ok(r.composites.mean > 9, `${r.composites.mean}`);
  assert.ok(r.nn.mean < 5, `${r.nn.mean}`);
  assert.ok(r.nnVsCompositesPct > 80);
});

test("swath slices along an axis, in whole blocks, with composites in each slice", () => {
  const est = [], nn = [];
  for (let i = 0; i < 6; i++) { est.push(cell(5 + 10 * i, 5, 5, i)); nn.push(cell(5 + 10 * i, 5, 5, 2 * i)); }
  const pts = [{ x: 3, y: 5, z: 5, value: 7, length: 1 }, { x: 52, y: 5, z: 5, value: 1, length: 3 }, { x: 58, y: 5, z: 5, value: 5, length: 1 }];
  const s = swath(est, nn, pts, "x", { width: 20 });
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((b) => b.blocks), [2, 2, 2]);
  assert.deepEqual(s.map((b) => b.estimate), [0.5, 2.5, 4.5]);
  assert.deepEqual(s.map((b) => b.nn), [1, 5, 9]);
  assert.equal(s[0].composite, 7);
  assert.equal(s[1].composite, null);
  assert.equal(s[2].composite, 2); // (1*3 + 5*1) / 4
  assert.equal(swath(est, nn, pts, "x")[0].to - swath(est, nn, pts, "x")[0].from, 10); // default: whole blocks
});

import test from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel } from "../src/lib/estimation.js";

// TASKS.csv #1210 — blocks beyond the search from the box around the samples are skipped before the neighbour search; none in reach may be lost
const pts = [{ x: 100, y: 100, z: 100, value: 5, hole_id: "A" }, { x: 200, y: 100, z: 100, value: 7, hole_id: "B" }];
const run = (cx, opts = {}) => estimateBlockModel(pts, { bounds: { xmin: cx - 0.5, xmax: cx + 0.5, ymin: 99.5, ymax: 100.5, zmin: 99.5, zmax: 100.5 }, cellSize: { dx: 1, dy: 1, dz: 1 }, method: "idw2", searchRadius: 50, ...opts }).blocksEstimated;
test("a block just inside the search beyond the samples is estimated; just outside it is not", () => {
  assert.equal(run(51), 1);
  assert.equal(run(49), 0);
  assert.equal(run(249), 1);
  assert.equal(run(251), 0);
  assert.equal(run(150), 1); // on the edge of both reaches, inside the box
});
test("under a trend the skip works in the trend's scaled frame", () => {
  const trend = { basis: { major: { x: 1, y: 0, z: 0 }, semiMajor: { x: 0, y: 1, z: 0 }, minor: { x: 0, y: 0, z: 1 } }, scales: { major: 0.5, semiMajor: 1, minor: 1 } };
  assert.equal(run(30, { trend }), 1); // 70 m along an axis scaled by a half reads 35
  assert.equal(run(30), 0);
});
test("with no search radius nothing is skipped", () => {
  assert.equal(run(-5000, { searchRadius: null }), 1);
});

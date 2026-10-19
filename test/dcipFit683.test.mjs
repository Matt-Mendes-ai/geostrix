// TASKS.csv #683 — per-reading observed / predicted / normalised residual, and the saved section keeps predicted data
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataFitRows, worstReadings, slimDcipResult } from "../src/lib/dcip.js";

const readings = [[0, 10, 20, 30], [10, 20, 30, 40], [20, 30, 40, 50]];
test("residuals are (obs - pred) / std, in file order; missing values give null", () => {
  const rows = dataFitRows(readings, [100, 200, 300], [110, 200, 240], [10, 20, 0]);
  assert.deepEqual(rows.map((r) => r.r), [-1, 0, null]);
  assert.equal(rows[0].s, 15); assert.equal(rows[0].depth, 10);
});
test("worst readings beyond k sigma, largest first", () => {
  const rows = dataFitRows(readings, [100, 200, 300], [160, 200, 240], [10, 20, 10]);
  assert.deepEqual(worstReadings(rows, 3).map((r) => r.i), [0, 2]);
});
test("a saved section keeps predicted and standard deviations (5 significant digits), DC and IP", () => {
  const res = { cells: { s: [], z: [], ds: [], dz: [], resistivity: [], support: [] }, electrodes: [], predicted: [123.456789], standardDeviation: [6.1728394],
    ip: { phi_d: 1, predicted: [12.3456789], standardDeviation: [0.5] } };
  const s = slimDcipResult(res);
  assert.deepEqual(s.predicted, [123.46]); assert.deepEqual(s.standardDeviation, [6.1728]);
  assert.deepEqual(s.ip.predicted, [12.346]); assert.deepEqual(s.ip.standardDeviation, [0.5]);
});

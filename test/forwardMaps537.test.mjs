// TASKS.csv #537 — forward-model maps on the data's level: residual RMS = the engine's rmsResidual.
import test from "node:test";
import assert from "node:assert/strict";
import { forwardMapValues, residualScale } from "../src/lib/inversion.js";

test("#537 predicted map carries the base level; residual RMS matches the engine's definition", () => {
  const pred = [0, 5, 20, 5, 0], observed = pred.map((p, i) => p + 150 + [1, -1, 2, -2, 0][i]);
  const b = observed.reduce((s, o, i) => s + (o - pred[i]), 0) / pred.length; // what potential.py fits
  const run = { predicted: pred, baseLevel: b };
  const p = forwardMapValues(observed, run).predicted;
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const engine = rms(observed.map((o, i) => o - pred[i] - b));
  assert.ok(Math.abs(rms(observed.map((o, i) => o - p[i])) - engine) < 1e-12);
  assert.ok(rms(observed.map((o, i) => o - pred[i])) > 149); // the old map: ~the base level
  assert.deepEqual(forwardMapValues(observed, { predicted: pred }).predicted, pred); // no base level reported: unchanged
});

test("#537 residual colour range: ±3σ with σ, else the 98th percentile of |residual|", () => {
  assert.equal(residualScale([0.5, -9], true), 3);
  const r = Array.from({ length: 100 }, (_, i) => (i % 2 ? 1 : -1) * (i + 1));
  assert.equal(residualScale(r, false), 98);
});

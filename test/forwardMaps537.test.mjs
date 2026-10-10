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

import { fitVerdict } from "../src/lib/inversion.js";
test("#536 an overshoot is reported as the solver's step, and a chosen earlier iterate is named", () => {
  const over = fitVerdict({ phi_d: 71.5, target: 225, iterations: 8, fitChoice: { how: "last", overshot: true, lastPhi: 71.5 } });
  assert.match(over.text, /last step overshot/); assert.doesNotMatch(over.text, /uncertainty may be set too large/);
  assert.match(fitVerdict({ phi_d: 71.5, target: 225, iterations: 8 }).text, /uncertainty may be set too large/); // no overshoot info: as before
  const ok = fitVerdict({ phi_d: 230, target: 225, iterations: 8, reachedTarget: true, fitChoice: { how: "earlier", overshot: true, lastPhi: 71.5, iteration: 7 } });
  assert.equal(ok.level, "ok"); assert.match(ok.text, /overshot to 0\.32x, so the model from iteration 7 is used/);
});

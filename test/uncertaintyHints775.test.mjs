// TASKS.csv #775 — SimPEG's tutorial uncertainty for magnetics as a hint: 2 % of the largest |anomaly| about the mean.
import test from "node:test";
import assert from "node:assert/strict";
import { simpegMagFloorHint } from "../src/lib/inversion.js";

test("2 % of the largest deviation from the mean, ignoring non-numbers", () => {
  assert.ok(Math.abs(simpegMagFloorHint([100, 100, 100, 600, NaN]) - 0.02 * 375) < 1e-9);
  assert.ok(Math.abs(simpegMagFloorHint([-50, 50]) - 1) < 1e-9);
});

test("no hint for flat or missing data", () => {
  assert.equal(simpegMagFloorHint([5, 5, 5]), null);
  assert.equal(simpegMagFloorHint([]), null);
  assert.equal(simpegMagFloorHint(undefined), null);
});

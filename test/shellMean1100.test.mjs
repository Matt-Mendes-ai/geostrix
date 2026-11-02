// TASKS.csv #1100 (review #1016), #1290 — the grade shell's mean grade leaves out the nodes the topography cap removed.
import test from "node:test";
import assert from "node:assert/strict";
import { capFieldAtGround, meanInsideShell } from "../src/lib/groundCap.js";

test("#1100 the mean is taken over nodes inside the shell after the cap", () => {
  // a 1 x 1 x 4 column, ground at z = 15: the two upper nodes (20, 30) are in the air and are capped below the cutoff
  const v = Float32Array.from([2, 2, 5, 5]), cut = 1;
  const { values } = capFieldAtGround(v, 1, 1, 4, { x: 0, y: 0, z: 0 }, { dx: 10, dy: 10, dz: 10 }, cut, () => 15);
  assert.equal(meanInsideShell(v, values, cut), 2); // was (2 + 2 + 5 + 5) / 4 = 3.5 with the air included
});

test("#1100 below the cutoff, no-data and an empty shell", () => {
  assert.equal(meanInsideShell([0.5, 2, NaN, 4], [0.5, 2, NaN, 4], 1), 3);
  assert.equal(meanInsideShell([0.5], [0.5], 1), null);
});

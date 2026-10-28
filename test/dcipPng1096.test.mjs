// TASKS.csv #1096 — DC/IP section PNG: colour range from the seen cells (2-98 %), compass ends
import { test } from "node:test";
import assert from "node:assert/strict";
import { rampRange, compass8 } from "../src/lib/dcipSectionImage.js";

test("#1096 cells pinned at the inversion bounds below the depth of investigation do not set the bar", () => {
  const vals = [], env = [];
  for (let i = 0; i < 100; i++) { vals.push(50 + i * 5); env.push(1); } // seen: 50-545 ohm.m
  vals.push(0.01, 100000, 100000); env.push(0, 0, 0); // hatched, at the bounds
  const r = rampRange(vals, env, 0.2, true);
  assert.ok(r.lo >= 50 && r.lo < 70 && r.hi > 520 && r.hi <= 545, JSON.stringify(r));
  assert.equal(rampRange([1, 2, 3], [0, 0, 0], 0.2, false).lo, 0); // nothing seen: all cells, from 0 for chargeability
});

test("#1096 compass names of the two ends", () => {
  assert.deepEqual([compass8(39 + 180), compass8(39), compass8(90), compass8(-10), compass8(359)], ["SW", "NE", "E", "N", "N"]);
});

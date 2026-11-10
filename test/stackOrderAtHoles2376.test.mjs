// TASKS.csv #2376 (review #2325, WA uranium) — a stack run's surfaces checked for their order at the holes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMeshQuery } from "../src/lib/meshQuery.js";
import { stackOrderAtHoles, surfaceTopAt } from "../src/lib/stackOrderAtHoles.js";

// a flat square sheet at height y over x, z in [0, 100], or tilted with y = y0 + k * x
const sheet = (y0, k = 0) => {
  const P = [[0, 0], [100, 0], [100, 100], [0, 100]].flatMap(([x, z]) => [x, y0 + k * x, z]);
  return buildMeshQuery(new Float32Array(P), new Uint32Array([0, 1, 2, 0, 2, 3]));
};
const holes = [10, 30, 50, 70, 90].map((x) => ({ x, z: 50 }));

test("the height of a surface under a hole", () => {
  assert.ok(Math.abs(surfaceTopAt(sheet(-20), 40, 40, -1000, 1000) + 20) < 1e-4);
  assert.equal(surfaceTopAt(sheet(-20), 140, 40, -1000, 1000), null); // past its edge
});

test("in order, out of order at some holes, and across an unconformity", () => {
  const ok = stackOrderAtHoles([{ label: "Top of I", q: sheet(-10) }, { label: "Top of H", q: sheet(-20) }], holes, { yLo: -1000, yHi: 1000 });
  assert.equal(ok.outOfOrder.length, 0);
  assert.deepEqual(ok.pairs[0], { younger: "Top of I", older: "Top of H", above: 0, of: 5, worstM: 0 });
  // the older surface rises through the younger one at x > 50 (y = -30 + 0.4 x: -26 ... +6 against -10)
  const bad = stackOrderAtHoles([{ label: "Top of E2", q: sheet(-10) }, { label: "Top of Basement", q: sheet(-30, 0.4) }], holes, { yLo: -1000, yHi: 1000 });
  assert.equal(bad.outOfOrder.length, 1);
  assert.equal(bad.pairs[0].above, 2); // x = 70 (-2) and x = 90 (+6)
  assert.ok(Math.abs(bad.pairs[0].worstM - 16) < 1e-3);
  const unc = stackOrderAtHoles([{ label: "A", package: 0, q: sheet(-10) }, { label: "B", package: 1, q: sheet(0) }], holes, { yLo: -1000, yHi: 1000 });
  assert.equal(unc.pairs.length, 0); // not compared across packages
});

test("runSurfaceStack says the order after a stack run", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /stackOrderAtHoles\(/);
  assert.match(s, /\{older\} lies above \{younger\} at \{above\} of \{of\} holes/);
});

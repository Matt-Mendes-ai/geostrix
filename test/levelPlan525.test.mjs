// TASKS.csv #525 — level-plan geometry.
import test from "node:test";
import assert from "node:assert/strict";
import { slabRuns, piercePoints, tracePolylines, voxelPlanRects, meshPlanCut, strikeDipSymbol } from "../src/lib/levelPlan.js";
import { desurveyHole } from "../src/lib/desurvey.js";

// a -60° hole to the east from (1000, 2000, 1000), 400 m
const trace = desurveyHole({ x: 1000, y: 2000, z: 1000, azimuth: 90, dip: 60, length: 400 }, []);
const s60 = Math.sin(Math.PI / 3), c60 = Math.cos(Math.PI / 3);

test("#525 pierce point at an RL: depth and position on the trace", () => {
  const p = piercePoints(trace, 850);
  assert.equal(p.length, 1);
  assert.ok(Math.abs(p[0].md - 150 / s60) < 1e-6);
  assert.ok(Math.abs(p[0].x - (1000 + (150 / s60) * c60)) < 1e-6 && Math.abs(p[0].y - 2000) < 1e-6);
  assert.equal(piercePoints(trace, 1100).length, 0); // above the collar
});

test("#525 slab runs: the depth interval inside RL ± h, and its plan polyline", () => {
  const runs = slabRuns(trace, 840, 860);
  assert.equal(runs.length, 1);
  assert.ok(Math.abs(runs[0][0] - 140 / s60) < 1e-6 && Math.abs(runs[0][1] - 160 / s60) < 1e-6);
  const pl = tracePolylines(trace, runs)[0];
  assert.ok(Math.abs(pl[0][0] - (1000 + (140 / s60) * c60)) < 1e-6);
  assert.ok(Math.abs(pl[pl.length - 1][0] - (1000 + (160 / s60) * c60)) < 1e-6);
  // a slab crossed between two samples (coarse trace) is still found
  const coarse = [{ md: 0, x: 0, y: 0, z: 100 }, { md: 100, x: 0, y: 0, z: 0 }];
  assert.deepEqual(slabRuns(coarse, 40, 60), [[40, 60]]);
  assert.deepEqual(slabRuns(coarse, 200, 300), []);
});

test("#525 block-model cells cut at the RL; a mesh cut by z = RL", () => {
  const cells = [{ x: 5, y: 5, z: 845, dx: 10, dy: 10, dz: 10, value: 1 }, { x: 15, y: 5, z: 835, dx: 10, dy: 10, dz: 10, value: 2 }];
  assert.deepEqual(voxelPlanRects(cells, 848).map((r) => [r.x0, r.y0, r.x1, r.y1, r.value]), [[0, 0, 10, 10, 1]]);
  // a tilted square from z = 800 (north edge) to z = 900 (south edge): the 850 contour is the line N = 50
  const v = [{ x: 0, y: 0, z: 900 }, { x: 100, y: 0, z: 900 }, { x: 100, y: 100, z: 800 }, { x: 0, y: 100, z: 800 }];
  const segs = meshPlanCut(4, [0, 1, 2, 0, 2, 3], (i) => v[i], 850);
  assert.equal(segs.length, 2);
  for (const s of segs) { assert.ok(Math.abs(s[1] - 50) < 1e-9 && Math.abs(s[3] - 50) < 1e-9); }
});

test("#525 strike / dip symbol: strike perpendicular to the dip direction", () => {
  const s = strikeDipSymbol(0, 0, 45, 90, 10);
  assert.ok(Math.abs(s.strike[0]) < 1e-9 && Math.abs(Math.abs(s.strike[1]) - 10) < 1e-9 && Math.abs(s.strike[2]) < 1e-9); // strike N-S for a dip direction of 90
  assert.ok(s.tick[2] > 0 && Math.abs(s.tick[3]) < 1e-9); // tick points east
});

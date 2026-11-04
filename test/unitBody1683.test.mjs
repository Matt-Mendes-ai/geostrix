// TASKS.csv #1683 (review #1645, Copley) — a unit body's auto cell and search from its own logged runs, and the containment check
import test from "node:test";
import assert from "node:assert/strict";
import { autoBodyParams, mergedRuns, autoHaloParams } from "../src/lib/viewer/geomath.js";
import { samplesInsideShell } from "../src/lib/shellSupport.js";

test("#1683 runs merge touching rows per hole; the auto cell is half the median run and the search twice it, within the hole-spacing values", () => {
  const rows = [{ hole_id: "A", from: 21, to: 40, value: "DIOR" }, { hole_id: "A", from: 40, to: 60, value: "DIOR" }, { hole_id: "B", from: 10, to: 10.6, value: "IFGD" }, { hole_id: "B", from: 30, to: 39.5, value: "IFGD" }];
  const runs = mergedRuns(rows);
  assert.deepEqual(runs.map((r) => [r.hole_id, r.from, r.to]), [["A", 21, 60], ["B", 10, 10.6], ["B", 30, 39.5]]);
  const fallback = autoHaloParams([{ x: 0, y: 0 }, { x: 405, y: 0 }, { x: 810, y: 0 }]); // hole spacing 405 m: 486 m search, 50 m cells
  assert.equal(Math.round(fallback.radius), 486); assert.equal(fallback.cell, 50);
  const a = autoBodyParams(runs.map((r) => r.to - r.from), fallback);
  assert.ok(a.fromRuns && a.runs === 3 && a.medianRunM === 9.5 && a.maxRunM === 39);
  assert.equal(a.cell, 4.75, "half the median run");
  assert.equal(a.radius, 19, "twice the median run (at least three cells)");
  const thin = autoBodyParams([0.6, 0.8, 1.0], fallback);
  assert.equal(thin.cell, 0.5, "never under half a metre"); assert.equal(thin.radius, 1.6);
  assert.deepEqual(autoBodyParams([], fallback), { ...fallback, fromRuns: false });
});

test("#1683 the containment check: inside points against the indicator field the body is the iso-surface of", () => {
  const grid = { origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 10, dy: 10, dz: 10 }, nx: 5, ny: 1, nz: 1 };
  const field = Float64Array.from([0.9, 0.2, NaN, 0.6, 0.1]);
  const pts = [{ x: 0, y: 0, z: 0, value: 1 }, { x: 10, y: 0, z: 0, value: 1 }, { x: 20, y: 0, z: 0, value: 1 }, { x: 30, y: 0, z: 0, value: 1 }, { x: 40, y: 0, z: 0, value: 0 }];
  const c = samplesInsideShell(pts, grid, field, 0.5);
  assert.deepEqual(c, { above: 4, inside: 2, outside: 1, noData: 1 });
  assert.equal(c.inside < c.above / 2, false, "half inside: not withheld");
  const c2 = samplesInsideShell(pts, grid, Float64Array.from([0.1, 0.2, 0.3, 0.6, 0.9]), 0.5);
  assert.equal(c2.inside, 1); assert.ok(c2.inside < c2.above / 2, "one of four inside: withheld");
});

// TASKS.csv #986 — terrain from contours: the densified vertex count is capped at about 4 per grid node.
import test from "node:test";
import assert from "node:assert/strict";
import { terrainFromPoints } from "../src/lib/terrainFromPoints.js";

// 10 km x 10 km of straight E-W contours 10 m apart (1,001 strings, 10,000 km of line): at half a node spacing that is
// 400,000 vertices for a 200 x 200 grid, ten per node
const lines = Array.from({ length: 1001 }, (_, k) => [{ x: 0, y: k * 10, z: 1000 + k }, { x: 10000, y: k * 10, z: 1000 + k }]);

test("#986: past about four vertices per grid node the contour step widens, and the result says so", () => {
  const t0 = performance.now();
  const t = terrainFromPoints({ lines }, { gridMax: 200 });
  const ms = performance.now() - t0;
  assert.ok(t.stats.densifyCapped);
  assert.ok(t.stats.points <= 4 * t.gridW * t.gridH + 1000, `${t.stats.points} points for ${t.gridW} x ${t.gridH}`);
  assert.ok(t.stats.densifyStepM > t.stats.halfCellM);
  // the surface is still right: a plane rising 0.1 m per m north
  const j = Math.floor(t.gridH / 2), mid = t.elevations[j * t.gridW + Math.floor(t.gridW / 2)];
  const y = t.bbox[3] - (j * (t.bbox[3] - t.bbox[1])) / (t.gridH - 1); // row 0 is north
  assert.ok(Math.abs(mid - (1000 + y / 10)) < 0.01, `${mid} at y ${y}`);
  assert.ok(ms < 20000, `${ms} ms`);
});

test("#986: a coarse grid is not capped (half-cell densification as before)", () => {
  const t = terrainFromPoints({ lines: lines.filter((_, k) => k % 100 === 0) }, { gridMax: 50 });
  assert.equal(t.stats.densifyCapped, false);
  assert.equal(t.stats.densifyStepM, t.stats.halfCellM);
});

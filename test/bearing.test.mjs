// TASKS.csv #490 — azimuths imported from another grid are turned to the project grid (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pointTransform, turnGridBearing, bearingTurn, reprojectXY } from "../src/lib/reproject.js";
import { fitSimilarity, applySimilarity, transformImportRows } from "../src/lib/localGrid.js";

const bearing = (x0, y0, x1, y1) => ((Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI + 360) % 360;

test("#490 grid bearing between UTM zones matches the geographic direction and round-trips", () => {
  // a hole near the 9N/10N boundary (126 W), expressed in zone 9 (3156) and moved to zone 10 (3157)
  const p9 = reprojectXY(-126.3, 56.5, 4326, 3156);
  const T = pointTransform(3156, 3157), back = pointTransform(3157, 3156);
  const a9 = 45;
  const a10 = turnGridBearing(T, p9.x, p9.y, a9);
  // independent check: a point 1 km along that bearing, transformed, gives the same direction in zone 10
  const r = (a9 * Math.PI) / 180;
  const [x0, y0] = T(p9.x, p9.y), [x1, y1] = T(p9.x + 1000 * Math.sin(r), p9.y + 1000 * Math.cos(r));
  assert.ok(Math.abs(bearingTurn(bearing(x0, y0, x1, y1), a10)) < 0.01);
  // grid north differs by several degrees across the zone boundary (4.97 deg measured on the Harry sample, #485)
  assert.ok(Math.abs(bearingTurn(a9, a10)) > 4 && Math.abs(bearingTurn(a9, a10)) < 6);
  // and back again
  assert.ok(Math.abs(bearingTurn(turnGridBearing(back, x0, y0, a10), a9)) < 0.02);
  // same CRS / non-finite input: unchanged
  assert.equal(turnGridBearing(pointTransform(3156, 3156), p9.x, p9.y, 123.45), 123.45);
  assert.ok(Number.isNaN(turnGridBearing(T, p9.x, p9.y, NaN)));
});

test("#490 a mine-grid azimuth turns with the grid rotation", () => {
  const th = (20 * Math.PI) / 180, s = 0.3048; // local grid in feet, rotated 20 deg counter-clockwise
  const toWorld = (lx, ly) => ({ x: s * (lx * Math.cos(th) - ly * Math.sin(th)) + 460000, y: s * (lx * Math.sin(th) + ly * Math.cos(th)) + 6170000 });
  const pts = [[1000, 2000], [5000, 2500], [3000, 7000]].map(([lx, ly]) => { const w = toWorld(lx, ly); return { lx, ly, wx: w.x, wy: w.y }; });
  const grid = fitSimilarity(pts);
  const { rows, turned } = transformImportRows([{ E: 1000, N: 2000, AZ: 90 }], { x: "E", y: "N", azimuth: "AZ" }, { grid });
  assert.equal(turned, 1);
  // local bearing 90 (local +x) -> world direction of the local x axis
  const a = applySimilarity(grid, 1000, 2000), b = applySimilarity(grid, 1100, 2000);
  assert.ok(Math.abs(bearingTurn(rows[0].AZ, bearing(a.x, a.y, b.x, b.y))) < 0.01);
  assert.ok(Math.abs(rows[0].AZ - 70) < 0.01);
  // no grid: azimuth untouched
  assert.equal(transformImportRows([{ AZ: 90 }], { azimuth: "AZ" }, {}).rows[0].AZ, 90);
});

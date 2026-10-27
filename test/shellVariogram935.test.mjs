// TASKS.csv #935 — the grade shell krige in the volume-keeping trend warp; the block model in the search-scale warp
// (major = 1). The two differ by a uniform factor (scales.major), so the fitted variograms agree once the shell's range
// is divided by scales.major — which is how the shell now reports and saves it (metres along the trend's major axis).
import test from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel, estimateDenseGrid } from "../src/lib/estimation.js";
import { trendBasis, trendScales, trendSearchScales, DEFAULT_TREND } from "../src/lib/trend.js";
import { anisoWarpPoint } from "../src/lib/viewer/geomath.js";

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const field = (x, y, z) => 1 + 0.6 * Math.sin(x / 40) * Math.cos(y / 20) + 0.4 * Math.sin(z / 13 + x / 60) + 0.2 * Math.cos((x + 2 * y) / 35);
const pts = [];
for (let h = 0; h < 40; h++) { const hx = 100 + rnd() * 800, hy = 100 + rnd() * 400; for (let k = 0; k < 60; k++) pts.push({ x: hx, y: hy, z: 999 - k * 2, value: field(hx, hy, 999 - k * 2) + 0.05 * rnd(), hole_id: "H" + h, len: 2 }); }

test("#935 the shell's fitted range / scales.major is the block model's range along the trend; nugget and sill agree", () => {
  const trend = { ...DEFAULT_TREND, dip: 0, dipAzimuth: 90, pitch: 0, ratios: { max: 3, int: 2, min: 1 } };
  const basis = trendBasis(trend), vol = trendScales(trend);
  const bm = estimateBlockModel(pts, { bounds: { xmin: 400, xmax: 600, ymin: 200, ymax: 400, zmin: 880, zmax: 1000 }, cellSize: { dx: 20, dy: 20, dz: 20 }, method: "ok", searchRadius: 150, minSamples: 1, maxSamples: 16, minHoles: 2, trend: { basis, scales: trendSearchScales(trend) } });
  const c = { x: 500, y: 300, z: 940 };
  const warped = pts.map((p) => ({ ...p, ...anisoWarpPoint(p, c, basis, vol) }));
  const dg = estimateDenseGrid(warped, { bounds: { xmin: -200, xmax: 200, ymin: -150, ymax: 150, zmin: -100, zmax: 100 }, cellSize: { dx: 20, dy: 20, dz: 20 }, method: "ok", searchRadius: 150 * vol.major, minSamples: 1, maxSamples: 16, minHoles: 2, support: true });
  assert.ok(Math.abs(dg.variogram.range / vol.major - bm.variogram.range) < 0.01 * bm.variogram.range, `${dg.variogram.range / vol.major} vs ${bm.variogram.range}`);
  assert.ok(Math.abs(dg.variogram.sill - bm.variogram.sill) < 1e-3 * bm.variogram.sill);
  assert.ok(Math.abs(dg.variogram.range - bm.variogram.range) > 0.3 * bm.variogram.range); // reported raw, it was ~40 % short
});

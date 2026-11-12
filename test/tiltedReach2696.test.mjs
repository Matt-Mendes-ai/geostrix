// TASKS.csv #2696 (split from #2422) — a tilted trend's search ellipsoid was counted as the sphere of its major semi-axis, in the dialog
// and in the estimator alike. segmentReach now takes the trend's metric (|M (p - q)| <= R, M = scales x basis^T) and counts the tilted
// ellipsoid swept along each segment exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentReach, gridShape } from "../src/lib/blockReach.js";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { trendBasis, trendSearchScales, cleanTrend } from "../src/lib/trend.js";

const trend = cleanTrend({ name: "t", dip: 50, dipAzimuth: 120, pitch: 30, ratios: { max: 4, int: 2, min: 1 } });
const metric = { basis: trendBasis(trend), scales: trendSearchScales(trend) };
const M = (() => { const { major: a, semiMajor: b, minor: c } = metric.basis, S = metric.scales; return [[a.x * S.major, a.y * S.major, a.z * S.major], [b.x * S.semiMajor, b.y * S.semiMajor, b.z * S.semiMajor], [c.x * S.minor, c.y * S.minor, c.z * S.minor]]; })();
const map = (v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
// the metric distance from p to segment ab, by fine sampling of the segment (a brute-force check)
const dist = (p, s) => { let best = Infinity; for (let i = 0; i <= 400; i++) { const t = i / 400; const q = [s[0] + t * (s[3] - s[0]), s[1] + t * (s[4] - s[1]), s[2] + t * (s[5] - s[2])]; const w = map([p[0] - q[0], p[1] - q[1], p[2] - q[2]]); best = Math.min(best, Math.hypot(...w)); } return best; };

test("the tilted-ellipsoid mask is exact against a brute-force check", () => {
  const segments = [[20, 30, 80, 70, 40, 20], [100, 90, 60, 100, 90, 60], [40, 120, 90, 60, 100, 30]];
  const bounds = { xmin: 0, xmax: 160, ymin: 0, ymax: 160, zmin: 0, zmax: 120 }, cell = { dx: 8, dy: 8, dz: 6 }, R = 40;
  const r = segmentReach(segments, bounds, cell, R, { metric });
  const g = gridShape(bounds, cell);
  let wrong = 0, near = 0;
  for (let iz = 0; iz < g.nz; iz++) for (let iy = 0; iy < g.ny; iy++) for (let ix = 0; ix < g.nx; ix++) {
    const p = [bounds.xmin + (ix + 0.5) * g.dx, bounds.ymin + (iy + 0.5) * g.dy, bounds.zmin + (iz + 0.5) * g.dz];
    const d = Math.min(...segments.map((s) => dist(p, s)));
    const want = d <= R ? 1 : 0, got = r.mask[ix + g.nx * (iy + g.ny * iz)];
    if (want !== got) { if (Math.abs(d - R) < 0.05) near++; else wrong++; }
  }
  assert.equal(wrong, 0, `${wrong} blocks wrong (${near} within 5 cm of the surface, the sampled check's own error)`);
  const sphere = segmentReach(segments, bounds, cell, R);
  assert.ok(r.reach < 0.6 * sphere.reach, `the ellipsoid holds ${r.reach} of the sphere's ${sphere.reach} blocks`);
});

test("estimates under a tilted trend are the same with the mask as without (#1416's guard)", () => {
  let s = 2696; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let h = 0; h < 9; h++) { const hx = (h % 3) * 60, hy = Math.floor(h / 3) * 60; for (let i = 0; i < 40; i++) pts.push({ hole_id: "H" + h, from: i * 2, to: i * 2 + 2, length: 2, x: hx + 0.3 * i, y: hy, z: 100 - 2 * i - 1, value: 1 + rnd() * 5 }); }
  const base = { bounds: { xmin: -40, xmax: 200, ymin: -40, ymax: 200, zmin: -10, zmax: 110 }, cellSize: { dx: 10, dy: 10, dz: 5 }, searchRadius: 50, minSamples: 1, maxSamples: 12, method: "idw2", trend: { basis: metric.basis, scales: metric.scales } };
  const a = estimateBlockModel(pts, base), b = estimateBlockModel(pts, { ...base, noReach: true });
  assert.equal(a.blocksEstimated, b.blocksEstimated);
  const key = (c) => `${c.x},${c.y},${c.z}`, mb = new Map(b.cells.map((c) => [key(c), c.value]));
  assert.ok(a.cells.every((c) => Math.abs(mb.get(key(c)) - c.value) < 1e-9), "every block's value equal");
  assert.ok(a.blocksInReach < b.blocksInReach);
});

test("the dialog counts with the trend's metric and says 'within reach', not one radius", async () => {
  const { readFileSync } = await import("node:fs");
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /\.\.\.\(modelTrend && !flatTrend \? \{ metric: \{ basis: trendBasis\(modelTrend\), scales: trendSearchScales\(modelTrend\) \} \} : \{\}\)/);
  assert.match(m, /: reachRz \|\| reachArgs\?\.metric \? tr\(", \{n\} within reach of the drilling \(only those can be estimated, and only those count\)"/);
  assert.match(m, /reachPending \? \(reachSolid \|\| reachRz \|\| reachArgs\?\.metric /);
});

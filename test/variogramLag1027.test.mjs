// TASKS.csv #1027 (review #1016) — ordinary kriging's automatic variogram lag comes from the spacing between holes, not
// from how many composites are loaded; the run reports blocks whose nearest composite is beyond the fitted range.
import test from "node:test";
import assert from "node:assert/strict";
import { suggestBetweenHoleLag, suggestLagDistance } from "../src/lib/variogram.js";
import { estimateBlockModel, okEstimate } from "../src/lib/estimation.js";

// vertical holes on a square grid `spacing` apart, 2 m composites down to `depth`
const holes = (nx, ny, spacing, depth = 200) => {
  const pts = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let z = 1; z < depth; z += 2) {
    const x = i * spacing, y = j * spacing;
    pts.push({ x, y, z: -z, value: 1 + Math.sin(x / 40) + Math.cos(y / 55) + 0.1 * Math.sin(z), hole_id: `H${i}_${j}`, from: z - 1, to: z + 1 });
  }
  return pts;
};

test("#1027 the between-hole lag is the hole spacing, whatever the number of holes; the downhole one is the composite length", () => {
  for (const [nx, ny] of [[2, 3], [5, 5], [12, 12]]) { // 600 to 14,400 composites
    const pts = holes(nx, ny, 50);
    assert.equal(suggestBetweenHoleLag(pts), 50, `${nx} x ${ny}`);
    assert.equal(suggestLagDistance(pts), 2, `${nx} x ${ny}`); // was 2 x (n / 600) on the stride subsample
  }
  assert.equal(suggestBetweenHoleLag(holes(1, 1, 50)), null); // one hole: no between-hole spacing
  assert.equal(suggestBetweenHoleLag(holes(2, 2, 50).map(({ hole_id: _h, ...p }) => p)), null); // no hole ids
});

test("#1027 the kriging run returns the spacing and counts blocks beyond the range", () => {
  const pts = holes(4, 4, 60);
  const bounds = { xmin: -30, xmax: 210, ymin: -30, ymax: 210, zmin: -200, zmax: 0 };
  const r = estimateBlockModel(pts, { bounds, cellSize: { dx: 30, dy: 30, dz: 20 }, method: "ok", searchRadius: 150, maxSamples: 12 });
  assert.equal(r.variogram.betweenHoleM, 60);
  assert.equal(r.variogram.lagM, 15); // a quarter of it
  assert.ok(Number.isFinite(r.okCounts.beyondRange) && r.okCounts.beyondRange <= r.okCounts.kriged);
  // an entered variogram with a 5 m range: every block not on a hole has its nearest composite beyond it
  const g = estimateBlockModel(pts, { bounds, cellSize: { dx: 30, dy: 30, dz: 20 }, method: "ok", searchRadius: 150, maxSamples: 12, variogram: { model: "spherical", nugget: 0.1, sill: 1, range: 5 } });
  assert.equal(g.variogram.fitted, false); assert.equal(g.variogram.betweenHoleM, 60);
  assert.ok(g.okCounts.beyondRange > g.okCounts.kriged / 2, JSON.stringify(g.okCounts));
});

test("#1027 kriging weights do not depend on the variogram's scale: a sill in the millions (Cu in ppm2) is not 'singular'", () => {
  const used = [[0, 0, 0], [3, 0, 0], [6, 0, 0], [40, 10, 0], [43, 10, 0], [10, 60, -5]].map(([x, y, z], i) => ({ p: { x, y, z }, value: 100 + i * 10, d2: (x - 20) ** 2 + (y - 15) ** 2 + z ** 2 }));
  const v1 = { model: "spherical", nugget: 0.13, sill: 1, range: 900 };
  const v2 = { ...v1, nugget: 0.13 * 3.55e6, sill: 3.55e6 };
  const a = okEstimate(used, 20, 15, 0, v1), b = okEstimate(used, 20, 15, 0, v2);
  assert.ok(a && b, "both solved");
  for (let i = 0; i < used.length; i++) assert.ok(Math.abs(a.weights[i] - b.weights[i]) < 1e-9);
  assert.ok(Math.abs(a.value - b.value) < 1e-6);
  assert.ok(Math.abs(b.kv / a.kv - 3.55e6) < 1e-3 * 3.55e6);
  assert.ok(Math.abs(a.weights.slice(0, used.length).reduce((s, w) => s + w, 0) - 1) < 1e-9); // unbiased
});

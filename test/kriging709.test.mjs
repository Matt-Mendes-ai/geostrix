// TASKS.csv #709 — ordinary kriging: weights, declustering, kriging variance, and a block-model run with a fitted variogram
import { test } from "node:test";
import assert from "node:assert/strict";
import { okEstimate, estimateBlockModel } from "../src/lib/estimation.js";

const s = (x, y, z, value, tx = 0, ty = 0, tz = 0) => ({ p: { x, y, z }, value, d2: (x - tx) ** 2 + (y - ty) ** 2 + (z - tz) ** 2 });
const vg = { model: "spherical", nugget: 0, sill: 1, range: 100 };

test("two samples at the same distance share the weight", () => {
  const k = okEstimate([s(-10, 0, 0, 2), s(10, 0, 0, 4)], 0, 0, 0, vg);
  assert.ok(Math.abs(k.value - 3) < 1e-9);
  assert.ok(k.kv > 0 && k.kv < vg.sill);
});

test("a cluster counts less than one independent sample (declustering)", () => {
  // three samples tight together on the left, one alone on the right, all ~20 m from the target
  const used = [s(-20, 0, 0, 1), s(-20, 1, 0, 1), s(-20, -1, 0, 1), s(20, 0, 0, 10)];
  const k = okEstimate(used, 0, 0, 0, vg);
  assert.ok(k.value > 4, `a plain average of the four would be 3.25; kriging gave ${k.value}`);
});

test("kriging variance grows with distance and with the nugget", () => {
  const near = okEstimate([s(-5, 0, 0, 1), s(5, 0, 0, 1)], 0, 0, 0, vg).kv;
  const far = okEstimate([s(-50, 0, 0, 1), s(50, 0, 0, 1)], 0, 0, 0, vg).kv;
  assert.ok(near < far);
  const nug = okEstimate([s(-5, 0, 0, 1), s(5, 0, 0, 1)], 0, 0, 0, { ...vg, nugget: 0.5 }).kv;
  assert.ok(nug > near);
});

test("a block model by kriging fits a variogram when none is given and reports a variance per block", () => {
  const pts = [];
  for (let h = 0; h < 6; h++) for (let k = 0; k < 20; k++) {
    const x = h * 25, y = (h % 2) * 25, z = -k * 5;
    pts.push({ x, y, z, value: 1 + Math.sin(x / 40) + 0.3 * Math.cos(z / 15) + 0.05 * ((h * 7 + k * 3) % 5), hole_id: `H${h}`, length: 5 });
  }
  const r = estimateBlockModel(pts, { bounds: { xmin: 0, xmax: 125, ymin: 0, ymax: 25, zmin: -95, zmax: 0 }, cellSize: { dx: 25, dy: 25, dz: 25 }, method: "ok", searchRadius: 80, maxSamples: 12 });
  assert.ok(r.variogram?.fitted && r.variogram.sill > 0 && r.variogram.range > 0);
  assert.ok(r.cells.length > 0);
  assert.ok(r.cells.every((c) => Number.isFinite(c.value) && c.kv >= 0));
  assert.equal(r.okCounts.kriged + r.okCounts.exact + r.okCounts.fallbackIdw, r.cells.length);
});

test("an entered variogram is used as given", () => {
  const pts = [{ x: 0, y: 0, z: 0, value: 1, hole_id: "A" }, { x: 50, y: 0, z: 0, value: 3, hole_id: "B" }];
  const r = estimateBlockModel(pts, { bounds: { xmin: 0, xmax: 50, ymin: -5, ymax: 5, zmin: -5, zmax: 5 }, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "ok", searchRadius: 100, variogram: { model: "exponential", nugget: 0.1, sill: 1, range: 60 } });
  assert.equal(r.variogram.fitted, false); assert.equal(r.variogram.model, "exponential");
});

test("max samples per hole caps any one hole's share of a block", async () => {
  const { selectUsed } = await import("../src/lib/estimation.js");
  const c = [...Array(10)].map((_, i) => ({ d2: i, hole_id: i < 8 ? "A" : "B" }));
  assert.equal(selectUsed(c, 6, 1, 0).filter((d) => d.hole_id === "A").length, 6);
  const capped = selectUsed(c, 6, 1, 3);
  assert.equal(capped.filter((d) => d.hole_id === "A").length, 3);
  assert.equal(capped.length, 5); // only 2 from B exist
});

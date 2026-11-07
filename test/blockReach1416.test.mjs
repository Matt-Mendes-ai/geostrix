// TASKS.csv #1416 (review #1352, Silvertip) — blocks out of every composite's reach: marked exactly, skipped without changing a
// single estimate, and the block model's budget counted on the rest; the dialog's pre-check from the drill traces never counts less
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockReach, gridShape, worldReach, densifyTraces, cellToFitReach, REACH_MAX_GRID } from "../src/lib/blockReach.js";
import { estimateBlockModel, estimateDenseGrid } from "../src/lib/estimation.js";

let seed = 1416; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

test("the mask is exactly the blocks whose centre lies within the radius of a point", () => {
  const bounds = { xmin: 0, xmax: 97, ymin: -20, ymax: 61, zmin: -50, zmax: 3 }, cell = { dx: 4, dy: 5, dz: 3 }, R = 13.7;
  const pts = Array.from({ length: 25 }, () => ({ x: rnd() * 110 - 5, y: rnd() * 90 - 25, z: rnd() * 60 - 55 }));
  const r = blockReach(pts, bounds, cell, R);
  const g = gridShape(bounds, cell);
  let brute = 0;
  for (let iz = 0; iz < g.nz; iz++) for (let iy = 0; iy < g.ny; iy++) for (let ix = 0; ix < g.nx; ix++) {
    const cx = bounds.xmin + (ix + 0.5) * g.dx, cy = bounds.ymin + (iy + 0.5) * g.dy, cz = bounds.zmin + (iz + 0.5) * g.dz;
    const inside = pts.some((p) => (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2 <= R * R) ? 1 : 0;
    brute += inside;
    assert.equal(r.mask[ix + g.nx * (iy + g.ny * iz)], inside, `block ${ix} ${iy} ${iz}`);
  }
  assert.equal(r.reach, brute);
  assert.ok(brute > 0 && brute < g.total);
  assert.equal(blockReach(pts, bounds, cell, 0).mask, null, "no radius: every block");
  assert.ok(blockReach(pts, { xmin: 0, xmax: 1e4, ymin: 0, ymax: 1e4, zmin: 0, zmax: 1e3 }, 1, 50).tooBig, `over ${REACH_MAX_GRID} blocks the box is refused`);
  assert.equal(worldReach(50, null), 50);
  assert.equal(worldReach(50, { scales: { major: 1, semiMajor: 2, minor: 4 } }), 50, "a trend's ellipsoid lies inside the radius' sphere");
  assert.equal(worldReach(0), null);
});

// three pads ~1 km apart, like Silvertip
const pts = [];
for (const [px, py] of [[0, 0], [1000, 150], [500, 900]]) for (let h = 0; h < 4; h++) {
  const hx = px + (h % 2) * 30, hy = py + Math.floor(h / 2) * 30;
  for (let i = 0; i < 60; i++) pts.push({ x: hx + i * 0.6, y: hy, z: 500 - 3 * i, value: 1 + rnd() * 10, hole_id: `P${px}H${h}`, length: 3 });
}
const bounds = { xmin: -40, xmax: 1100, ymin: -40, ymax: 970, zmin: 280, zmax: 520 };
const s2 = Math.SQRT1_2;
const trend = { basis: { major: { x: s2, y: s2, z: 0 }, semiMajor: { x: -s2, y: s2, z: 0 }, minor: { x: 0, y: 0, z: 1 } }, scales: { major: 1, semiMajor: 2, minor: 3 } };

test("every method gives the same blocks, values and counts with the unreachable blocks skipped", () => {
  const base = { bounds, cellSize: { dx: 20, dy: 20, dz: 10 }, searchRadius: 60, minSamples: 1, maxSamples: 12, maxBlocks: 2000000 };
  for (const extra of [{ method: "idw2" }, { method: "nn", minHoles: 2 }, { method: "mls1", support: true }, { method: "idw2", support: true, trend },
    { method: "ok", variogram: { model: "spherical", nugget: 1, sill: 8, range: 80 } }, { method: "idw2", columns: true, support: true }]) {
    const a = estimateBlockModel(pts, { ...base, ...extra });
    const b = estimateBlockModel(pts, { ...base, ...extra, noReach: true });
    const { blocksInReach, ...ra } = a, { blocksInReach: tot, ...rb } = b;
    assert.deepEqual(ra, rb, JSON.stringify(extra).slice(0, 80));
    assert.ok(a.blocksEstimated > 100 && blocksInReach < tot / 10, `${extra.method}: ${a.blocksEstimated} estimated, ${blocksInReach} in reach of ${tot}`);
  }
  for (const extra of [{ method: "idw2", support: true }, { method: "idw2", trend }]) {
    const a = estimateDenseGrid(pts, { ...base, ...extra }), b = estimateDenseGrid(pts, { ...base, ...extra, noReach: true });
    assert.deepEqual(Array.from(a.values), Array.from(b.values));
    assert.deepEqual(a.supportCounts, b.supportCounts);
    assert.equal(a.estimated, b.estimated);
  }
});

test("the block model's budget counts the blocks in reach: a 10 m grid over the three pads runs within 200,000", () => {
  const opts = { bounds, cellSize: { dx: 10, dy: 10, dz: 10 }, searchRadius: 50, method: "idw2", maxBlocks: 200000 };
  assert.ok(gridShape(bounds, 10).total > 200000, "the box alone is over the budget");
  const r = estimateBlockModel(pts, opts);
  assert.ok(r.blocksInReach <= 200000 && r.blocksEstimated > 0);
  assert.throws(() => estimateBlockModel(pts, { ...opts, noReach: true }), /over the 200,000-block limit/);
  assert.throws(() => estimateBlockModel(pts, { ...opts, cellSize: { dx: 2, dy: 2, dz: 2 } }), /lie within the search radius of the composites/);
});

test("the dialog's count from the traces is never below the composites' reach; the cell that fits", () => {
  // the holes as traces: straight lines along each hole's points
  const byHole = new Map();
  for (const p of pts) { if (!byHole.has(p.hole_id)) byHole.set(p.hole_id, []); byHole.get(p.hole_id).push(p); }
  const traces = [...byHole.values()].map((h) => [h[0], h[h.length - 1]]);
  const cell = 7, R = 40;
  const { points, margin } = densifyTraces(traces, Math.min(cell, R) / 2);
  const fromTraces = blockReach(points, bounds, cell, R, { margin });
  const fromPts = blockReach(pts, bounds, cell, R);
  for (let i = 0; i < fromPts.mask.length; i++) if (fromPts.mask[i]) assert.equal(fromTraces.mask[i], 1, `block ${i} reached by a composite but not counted`);
  assert.ok(fromTraces.reach < fromPts.reach * 1.3, "and not wildly more");
  const c = cellToFitReach(points, bounds, R, 50000, 2, { margin });
  assert.ok(blockReach(points, bounds, c, R, { margin }).reach <= 50000);
  assert.ok(blockReach(points, bounds, c - 0.5, R, { margin }).reach > 50000 * 0.9, `${c} m is about the smallest that fits`);
});

test("wired: the dialog's pre-check and grid line use the reach from the drill traces", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /blockReach\(reachPts\.points, bounds, cell3, reachRadius, \{ margin: reachPts\.margin \}\)/);
  assert.match(m, /const overLimit = blocksInReach > blockBudget;/);
  assert.match(m, /const c = fitTo\(blockBudget, 10\);/);
});

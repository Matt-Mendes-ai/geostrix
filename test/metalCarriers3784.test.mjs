// TASKS.csv #3784 — how few composites carry the metal, and the share of composites against blocks at a cut-off (lib/metalCarriers.js,
// lib/estimation.js opts.carry). Synthetic drilling only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { metalCarriers, gradeQuantiles, shareAtOrAbove } from "../src/lib/metalCarriers.js";

// nine vertical holes on a 20 m grid, 2 m composites of 0.2 g/t, and one 50 g/t composite in the centre hole
function holes() {
  const pts = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let z = -1; z > -60; z -= 2) pts.push({ hole_id: `H${i}${j}`, x: 20 * i, y: 20 * j, z, value: i === 1 && j === 1 && z === -31 ? 50 : 0.2, length: 2 });
  return pts;
}
const bounds = { xmin: -5, xmax: 45, ymin: -5, ymax: 45, zmin: -60, zmax: 0 };
const blockSum = (r) => r.cells.reduce((s, c) => s + Math.max(0, c.value), 0);

for (const method of ["idw2", "nn", "ok"]) {
  test(`#3784 — ${method}: the composites' credits add up to the blocks' values, the high one carrying its share`, () => {
    const pts = holes();
    const r = estimateBlockModel(pts, { bounds, cellSize: 5, method, searchRadius: 40, maxSamples: 16, carry: true, noReach: true, ...(method === "ok" ? { variogram: { model: "spherical", nugget: 0.1, sill: 1, range: 40 } } : {}) });
    assert.equal(r.carry.length, pts.length);
    const total = r.carry.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(total - blockSum(r)) < 1e-6 * blockSum(r), `${total} vs ${blockSum(r)}`);
    const hi = pts.findIndex((p) => p.value === 50);
    // inverse distance and kriging spread it over the blocks round it; nearest-neighbour credits it with its own blocks only
    if (method === "nn") assert.ok(r.carry[hi] < 0.2 * total); // here no block centre has it nearest (the 0.2 g/t composite 2 m below is nearer)
    else assert.ok(r.carry[hi] > 0.05 * total, "one 50 g/t composite carries a large part");
  });
}

test("#3784 — without carry the run is unchanged and returns none", () => {
  const pts = holes(), a = estimateBlockModel(pts, { bounds, cellSize: 5, method: "idw2", searchRadius: 40, noReach: true }), b = estimateBlockModel(pts, { bounds, cellSize: 5, method: "idw2", searchRadius: 40, noReach: true, carry: true });
  assert.equal(a.carry, undefined);
  assert.deepEqual(a.cells.map((c) => c.value), b.cells.map((c) => c.value));
});

test("#3784 — carryInside: only the blocks inside the solid are credited", () => {
  // a closed box x 10-30, y 10-30, z -40 to -20 (12 triangles, outward)
  const v = [[10, 10, -40], [30, 10, -40], [30, 30, -40], [10, 30, -40], [10, 10, -20], [30, 10, -20], [30, 30, -20], [10, 30, -20]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const positions = Float32Array.from(v.flat()), indices = Uint32Array.from(f.flat());
  const pts = holes(), r = estimateBlockModel(pts, { bounds, cellSize: 5, method: "idw2", searchRadius: 40, noReach: true, carry: true, carryInside: { positions, indices } });
  const inside = r.cells.filter((c) => c.x > 10 && c.x < 30 && c.y > 10 && c.y < 30 && c.z > -40 && c.z < -20);
  const total = r.carry.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(total - inside.reduce((s, c) => s + Math.max(0, c.value), 0)) < 1e-6 * total);
});

test("#3784 — the fewest composites holding half the metal, the ten highest's share, and the shares at a cut-off", () => {
  assert.deepEqual(metalCarriers(Float64Array.from([50, 10, 10, 10, 10, 10])), { halfFrom: 1, contributing: 6, tenHighestShare: 1 });
  assert.equal(metalCarriers(Float64Array.from([1, 1, 1, 1])).halfFrom, 2);
  assert.equal(metalCarriers(new Float64Array(3)), null);
  // 88 composites at 0.1 and 12 at 5 (2 m each): 12 % at or above 3
  const pts = [...Array.from({ length: 88 }, () => ({ value: 0.1, length: 2 })), ...Array.from({ length: 12 }, () => ({ value: 5, length: 2 }))];
  const q = gradeQuantiles(pts);
  assert.equal(q.length, 200);
  assert.equal(shareAtOrAbove(q, 3), 0.12);
  assert.equal(shareAtOrAbove(q, 0.05), 1);
  assert.equal(shareAtOrAbove(null, 3), null);
  // length-weighted: one 10 m composite at 5 among ten 1 m at 0.1 is half the length
  assert.equal(shareAtOrAbove(gradeQuantiles([{ value: 5, length: 10 }, ...Array.from({ length: 10 }, () => ({ value: 0.1, length: 1 }))]), 3), 0.5);
});

test("#3784 — the wiring: the dialog records the checks, the worker sends the credits, Grade-tonnage says them", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /carry: true, \.\.\.\(carryInside \? \{ carryInside \} : \{\}\), \/\/ #3784/);
  assert.match(m, /params\.metalCarriers = \{ \.\.\.mc, composites: estPts\.length/);
  assert.match(m, /params\.estimateCheck = \{ estimateMean:/);
  assert.match(m, /params\.compositeGrades = \{ quantiles: q/);
  const w = readFileSync(new URL("../src/lib/estimation.worker.js", import.meta.url), "utf8");
  assert.match(w, /result\.carry \? \[result\.carry\.buffer\] : \[\]/);
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /Half of this model's metal comes from \{k\} of its \{n\} composites; the ten highest carry \{p\}%\./);
  assert.match(g, /Capped at \{cap\} \{unit\}: \{k\} of \{n\} samples capped, \{pct\}% of the metal \(grade × length\) removed\./);
  assert.match(g, /compQ && \(\(\) => \{ const c = shareAtOrAbove\(compQ, r\.cutoff\), b = cellsUsed\.length \? r\.blocks \/ cellsUsed\.length : null;/);
  assert.match(g, /\{compQ && <th style=\{th\} title=/);
});

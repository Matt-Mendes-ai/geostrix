// TASKS.csv #516 — estimation.js had no tests. Moving-least-squares on coplanar holes, exactness, minHoles, and
// block-model vs dense-grid parity (#142).
import test from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel, estimateDenseGrid } from "../src/lib/estimation.js";

// vertical holes at the given (x, y), a sample every 5 m from z = 0 to 50, grade = x / 10 (a pure east trend)
const holes = (xy) => xy.flatMap(([x, y], h) => Array.from({ length: 11 }, (_, k) => ({ x, y, z: k * 5, value: x / 10, hole_id: `H${h}`, length: 1 })));
const one = (pts, opts, at) => {
  const r = estimateBlockModel(pts, { bounds: { xmin: at.x - 1, xmax: at.x + 1, ymin: at.y - 1, ymax: at.y + 1, zmin: at.z - 1, zmax: at.z + 1 }, cellSize: { dx: 2, dy: 2, dz: 2 }, searchRadius: 100, maxSamples: 64, ...opts });
  return { value: r.cells[0]?.value, r };
};

test("#516 MLS (linear) on holes drilled on ONE section reproduces the trend (was IDW² 1.765)", () => {
  const pts = holes([[0, 25], [10, 25], [30, 25]]); // all on y = 25
  const mls = one(pts, { method: "mls1" }, { x: 15, y: 25, z: 25 });
  assert.ok(Math.abs(mls.value - 1.5) < 1e-6, String(mls.value));
  assert.deepEqual(mls.r.mlsCounts, { full: 0, reduced: 1, idw: 0 });
  const idw = one(pts, { method: "idw2" }, { x: 15, y: 25, z: 25 });
  assert.notEqual(Math.round(idw.value * 1000), 1500); // IDW can't follow the trend
});

test("#516 two sections: the full 3D fit, counted as such", () => {
  const pts = holes([[0, 0], [30, 0], [0, 50], [30, 50]]);
  const r = one(pts, { method: "mls1" }, { x: 15, y: 25, z: 25 });
  assert.ok(Math.abs(r.value - 1.5) < 1e-6); assert.deepEqual(r.r.mlsCounts, { full: 1, reduced: 0, idw: 0 });
});

test("#516 off the samples' plane, the in-plane trend is used at the cell's projection (and said to be)", () => {
  const pts = holes([[0, 25], [10, 25], [30, 25]]);
  const r = one(pts, { method: "mls1" }, { x: 15, y: 40, z: 25 }); // 15 m off the section
  assert.ok(Math.abs(r.value - 1.5) < 1e-6); assert.equal(r.r.mlsCounts.reduced, 1);
});

test("exact at a sample position; minHoles rejects a single-hole neighbourhood", () => {
  const pts = holes([[0, 0], [30, 0], [0, 50]]);
  for (const method of ["idw2", "idw3", "mls1"]) assert.ok(Math.abs(one(pts, { method }, { x: 30, y: 0, z: 25 }).value - 3) < 1e-9, method);
  const single = holes([[0, 0]]);
  assert.equal(one(single, { method: "idw2", minHoles: 2 }, { x: 2, y: 0, z: 25 }).r.cells.length, 0);
  assert.equal(one(single, { method: "idw2", minHoles: 1 }, { x: 2, y: 0, z: 25 }).r.cells.length, 1);
});

test("#142 block model and dense grid give the same value at the same cell centres", () => {
  const pts = holes([[0, 0], [30, 0], [0, 50], [40, 45], [15, 25]]).map((p, i) => ({ ...p, value: p.value + Math.sin(i) }));
  const opts = { bounds: { xmin: -10, xmax: 50, ymin: -10, ymax: 60, zmin: 0, zmax: 50 }, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "mls1", searchRadius: 40, maxSamples: 16 };
  const b = estimateBlockModel(pts, opts), d = estimateDenseGrid(pts, opts);
  let compared = 0;
  for (const c of b.cells) {
    const ix = Math.round((c.x - d.origin.x) / d.cellSize.dx), iy = Math.round((c.y - d.origin.y) / d.cellSize.dy), iz = Math.round((c.z - d.origin.z) / d.cellSize.dz);
    assert.ok(Math.abs(d.values[ix + d.nx * (iy + d.ny * iz)] - c.value) < 1e-9); compared++;
  }
  assert.ok(compared > 50, String(compared));
});

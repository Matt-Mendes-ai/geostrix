// TASKS.csv #481 — SimPEG / UBC air cells (1e-8) in a conductivity model are no-data, not rock.
import test from "node:test";
import assert from "node:assert/strict";
import { maskAirCells, ubcMeshToCells, coarsenUBCModel } from "../src/lib/voxel.js";

test("#481 air at 1e-8 is masked before reducing; models without air are untouched", () => {
  // 1 x 1 x 4 column, top two cells air (canonical order: x fastest, then z top-down, then y)
  const mesh = { nx: 1, ny: 1, nz: 4, x0: 0, y0: 0, z0: 100, dx: [10], dy: [10], dz: [10, 10, 10, 10] };
  const vals = Float64Array.from([1e-8, 1e-8, 0.01, 0.03]);
  const r = maskAirCells(vals);
  assert.deepEqual(r, { count: 2, value: 1e-8 });
  const cells = ubcMeshToCells(mesh, vals);
  assert.deepEqual(cells.map((c) => [c.z, c.value]), [[75, 0.01], [65, 0.03]]); // only the ground, at the bottom
  // reducing 2 layers into 1: the top coarse cell is ALL air -> no data; the bottom averages ground only
  const co = coarsenUBCModel(mesh, vals, 1, 1, 2);
  const coarse = ubcMeshToCells(co.mesh, co.values);
  assert.equal(coarse.length, 1);
  assert.ok(Math.abs(coarse[0].value - 0.02) < 1e-12);
  // a susceptibility model with no 1e-8 air, or with only a few tiny values, is left alone
  const susc = Float64Array.from([0.001, 0.002, 0.05, 0.001]);
  assert.equal(maskAirCells(susc).count, 0);
  const rare = Float64Array.from([1e-8, ...new Array(99).fill(0.01)]);
  assert.equal(maskAirCells(rare).count, 0); // 1 % of cells: not treated as air
});

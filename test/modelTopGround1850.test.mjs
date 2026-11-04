// TASKS.csv #1850 (review #1646, Kodiak) — with no terrain and no collars the pit's ground is the top of each block column,
// interpolated between columns, never one flat plane at the model's highest block (which mined the air over lower columns as waste)
import { test } from "node:test";
import assert from "node:assert/strict";
import { modelTopGround, buildPitGrid, pitEconomics, runPitShell, runPitSeries } from "../src/lib/pitShell.js";

// two columns of 10 m blocks: the west column tops out at 100 m, the east one at 60 m
const cells = [];
for (let k = 0; k < 10; k++) cells.push({ x: 5, y: 5, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 3 });
for (let k = 0; k < 6; k++) cells.push({ x: 15, y: 5, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 3 });
const inputs = { unit: "g/t", element: "Au", price: 1800, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 60, density: 2.7, slopeDeg: 45, revenueFactor: 1, size: null };

test("the model's column tops make the ground, interpolated between the columns", () => {
  const g = modelTopGround(cells);
  assert.ok(Math.abs(g(5, 5) - 100) < 1e-9 && Math.abs(g(15, 5) - 60) < 1e-9);
  const between = g(25, 5);
  assert.ok(between > 60 && between < 100, String(between)); // beyond the columns: between the two, weighted to the nearer
  assert.equal(modelTopGround([]), null);
});

test("the grid's ground follows the columns: no air over the lower column is counted as rock", () => {
  const e = pitEconomics(inputs);
  const grid = buildPitGrid(cells, { slopeDeg: 45, density: 2.7, economics: e, miningCost: 3, processingCost: 60, groundAt: modelTopGround(cells) });
  const col = (x) => Math.round((x - grid.x0) / grid.dx - 0.5), row = Math.round((5 - grid.y0) / grid.dy - 0.5);
  assert.ok(Math.abs(grid.ground[row * grid.nx + col(5)] - 100) < 1e-6);
  assert.ok(Math.abs(grid.ground[row * grid.nx + col(15)] - 60) < 1e-6);
  // the cell over the east column between 60 and 70 m is air: no rock
  const k = Math.round((65 - grid.z0) / grid.dz - 0.5);
  assert.equal(grid.rockT[k * grid.nx * grid.ny + row * grid.nx + col(15)], 0);
  // the flat plane of old: the same cell held 10 m of rock
  const flat = buildPitGrid(cells, { slopeDeg: 45, density: 2.7, economics: e, miningCost: 3, processingCost: 60, groundAt: null });
  assert.ok(flat.rockT[k * flat.nx * flat.ny + row * flat.nx + col(15)] > 0);
});

test("the pit and the series take the model's tops when there is no terrain and no collar", () => {
  const r = runPitShell({ ...inputs, cells });
  assert.equal(r.groundSource, "model top");
  const flat = runPitShell({ ...inputs, cells }, { collars: [] }); // no collar with a position: the same ground
  assert.ok(Math.abs(flat.rockT - r.rockT) < 1e-6);
  const s = runPitSeries({ ...inputs, cells }, [1]);
  assert.equal(s.groundSource, "model top");
  assert.ok(Math.abs(s.runs[0].rockT - r.rockT) < 1e-6);
  // with collars the collars still win
  const c = runPitShell({ ...inputs, cells }, { collars: [{ x: 5, y: 5, z: 100 }, { x: 15, y: 5, z: 60 }] });
  assert.equal(c.groundSource, "collars");
});

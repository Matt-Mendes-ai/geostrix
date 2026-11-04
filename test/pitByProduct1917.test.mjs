// TASKS.csv #1917 (from #1615 Lawyers, #1749 Copley) — a by-product metal (Ag beside Au) from its own block model on the same
// grid, with its own price and recovery: a block's revenue is the sum over the metals, so a body that does not pay on the main
// metal alone can pay with the by-product, and the pit reports the second metal and its share of the revenue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pitEconomics, cellRevenue, cellMargin, joinByProduct, runPitShell, runPitSeries, buildPitGrid, pitSummary, solvePit } from "../src/lib/pitShell.js";

const G_PER_OZ = 31.1034768;
// a 3 x 3 x 2 model of 10 m blocks: Au 0.3 g/t everywhere (below its own cut-off), Ag 100 g/t everywhere
const cells = [];
for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 0.3 });
const agCells = cells.map((c) => ({ x: c.x, y: c.y, z: c.z, value: 100 }));
const base = { unit: "g/t", element: "Au", price: 1800, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 60, density: 2.7, slopeDeg: 45, revenueFactor: 1, size: null };
const by = { unit: "g/t", element: "Ag", price: 25, priceUnit: "oz", recovery: 80 };

test("the economics carry the by-product's own revenue per grade and the cut-off of each metal alone", () => {
  const e = pitEconomics({ ...base, by });
  assert.ok(Math.abs(e.revenuePerGrade - 0.9 * (1800 / G_PER_OZ)) < 1e-9);
  assert.ok(Math.abs(e.by.revenuePerGrade - 0.8 * (25 / G_PER_OZ)) < 1e-9);
  assert.ok(Math.abs(e.cutoff - 60 / e.revenuePerGrade) < 1e-9); // Au alone: ~1.15 g/t
  assert.ok(Math.abs(e.by.cutoff - 60 / e.by.revenuePerGrade) < 1e-9); // Ag alone: ~93 g/t
  assert.equal(e.by.metalUnit, "g");
  // a block's revenue is the sum; without a by-product grade it is the main metal's alone
  const c = { value: 0.3, by: 100 };
  assert.ok(Math.abs(cellRevenue(c, e) - (0.3 * e.revenuePerGrade + 100 * e.by.revenuePerGrade)) < 1e-9);
  assert.ok(cellRevenue({ value: 0.3 }, e) < 60 && cellRevenue(c, e) > 60);
  assert.ok(cellMargin({ value: 0.3 }, e, 3, 60) === -3 && cellMargin(c, e, 3, 60) > 0);
  // the revenue factor scales both prices
  const h = pitEconomics({ ...base, by, revenueFactor: 0.5 });
  assert.ok(Math.abs(h.by.revenuePerGrade - e.by.revenuePerGrade / 2) < 1e-12);
  // a by-product whose unit cannot be priced
  assert.equal(pitEconomics({ ...base, by: { ...by, unit: "index" } }).byFailed, true);
});

test("the join is by block centre: the same grid matches every block, a shifted one none, a part some", () => {
  assert.equal(joinByProduct(cells, agCells).matched, cells.length);
  assert.equal(joinByProduct(cells, agCells).cells[0].by, 100);
  assert.equal(joinByProduct(cells, agCells.map((c) => ({ ...c, x: c.x + 5 }))).matched, 0);
  const half = joinByProduct(cells, agCells.slice(0, 9));
  assert.equal(half.matched, 9);
  assert.equal(half.cells[17].by, undefined);
});

test("Au alone pays nothing; with the Ag credited the pit exists and reports both metals", () => {
  const alone = runPitShell({ ...base, cells });
  assert.equal(alone.empty, true);
  const r = runPitShell({ ...base, cells, by, byCells: agCells });
  assert.ok(r.blocks > 0, "a pit");
  assert.equal(r.by.matchedShare, 1);
  assert.ok(Math.abs(r.meanGrade - 0.3) < 1e-9 && Math.abs(r.by.meanGrade - 100) < 1e-9);
  assert.ok(Math.abs(r.by.metalU - 100 * r.oreT) < 1e-6);
  assert.equal(r.by.metalUnit, "g");
  // the shares of the revenue: Ag 100 x 0.643 = 64.3 against Au 0.3 x 52.1 = 15.6 $/t
  const e = pitEconomics({ ...base, by });
  assert.ok(Math.abs(r.by.revenueShare - (100 * e.by.revenuePerGrade) / (100 * e.by.revenuePerGrade + 0.3 * e.revenuePerGrade)) < 1e-9);
  assert.ok(r.by.revenueShare > 0.8);
  // the money is the summed revenue less the costs
  assert.ok(Math.abs(r.money - (r.metalU * e.revenuePerGrade + r.by.metalU * e.by.revenuePerGrade - r.oreT * 60 - r.rockT * 3)) < 1e-3);
  // another grid: refused, never silently priced as barren
  assert.equal(runPitShell({ ...base, cells, by, byCells: agCells.map((c) => ({ ...c, x: c.x + 5 })) }).failed, "by-grid");
  assert.equal(runPitShell({ ...base, cells, by: { ...by, unit: "index" }, byCells: agCells }).failed, "by-units");
  // the parts carry the second metal too
  assert.ok(Math.abs(r.parts.pits[0].meanGrade2 - 100) < 1e-9);
});

test("blocks without a by-product grade count none of it, and the share says so", () => {
  const r = runPitShell({ ...base, cells, by, byCells: agCells.slice(9) }); // the top level only
  assert.ok(r.blocks > 0);
  assert.ok(Math.abs(r.by.matchedShare - 0.5) < 1e-9);
  // the lower level has no Ag and does not pay on Au alone, so the pit is the top level: 9 blocks of 10 m at 2.7 t/m3
  assert.ok(Math.abs(r.oreT - 9 * 1000 * 2.7) < 1e-3, String(r.oreT));
  assert.ok(Math.abs(r.by.meanGrade - 100) < 1e-9);
});

test("the nested series carries the by-product and values each shell with it", () => {
  const r = runPitSeries({ ...base, cells, by, byCells: agCells }, [0.5, 1]);
  assert.equal(r.byMetalUnit, "g");
  const top = r.runs[1];
  assert.ok(top.blocks > 0 && Math.abs(top.meanGrade2 - 100) < 1e-9);
  assert.ok(Math.abs(top.metalU2 - 100 * top.oreT) < 1e-6);
  assert.equal(runPitSeries({ ...base, cells, by, byCells: agCells.map((c) => ({ ...c, z: c.z + 3 })) }, [1]).failed, "by-grid");
});

test("a grid without the by-product arrays still summarizes (older callers)", () => {
  const e = pitEconomics(base);
  const g = buildPitGrid(cells.map((c) => ({ ...c, value: 3 })), { slopeDeg: 45, density: 2.7, economics: e, miningCost: 3, processingCost: 60 });
  delete g.metalU2;
  const s = pitSummary(g, solvePit(g, 45).mined);
  assert.ok(s.blocks > 0 && s.metalU2 === 0 && s.meanGrade2 === 0);
});

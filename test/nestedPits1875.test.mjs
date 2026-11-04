// TASKS.csv #1875 — nested pits: one grid for every revenue factor, shells valued at the entered price, a schedule with an NPV
import test from "node:test";
import assert from "node:assert/strict";
import { runPitSeries, runPitShell, buildPitGrid, pitEconomics, pitValueAt, solvePit } from "../src/lib/pitShell.js";

// a 9 x 9 x 6 block model, 10 m blocks, grades falling off from a rich core at the centre, flat ground on top (model top)
function model() {
  const cells = [];
  for (let k = 0; k < 6; k++) for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const d = Math.hypot(i - 4, j - 4), z = 100 - k * 10 - 5;
    cells.push({ x: 1000 + i * 10 + 5, y: 2000 + j * 10 + 5, z, dx: 10, dy: 10, dz: 10, value: Math.max(0, 4 - d) * (1 - k * 0.1) });
  }
  return cells;
}
const inputs = { cells: model(), unit: "g/t", element: "Au", price: 60, priceUnit: "g", recovery: 90, miningCost: 3, processingCost: 20, density: 2.5, slopeDeg: 45, revenueFactor: 1, size: null };

test("the shells nest on one grid and grow with the revenue factor; each is valued at the entered price", () => {
  const r = runPitSeries(inputs, [0.5, 0.8, 1, 1.2]);
  assert.equal(r.runs.length, 4);
  for (let i = 1; i < r.runs.length; i++) assert.ok(r.runs[i].rockT >= r.runs[i - 1].rockT, "a higher factor never mines less rock");
  const one = r.runs.find((x) => x.rf === 1);
  assert.ok(Math.abs(one.moneyBase - one.money) < 1e-6, "at RF 1 the base value is the solver's own");
  const high = r.runs.find((x) => x.rf === 1.2);
  assert.ok(high.moneyBase <= one.moneyBase + 1e-6, "the RF 1.2 shell cannot beat the RF 1 optimum at the entered price");
  assert.ok(high.moneyScaled >= high.moneyBase, "the scaled-price figure overstates it");
  assert.equal(r.runs.reduce((a, x) => a + (x.pushbackCells || 0), 0), high.blocks, "the pushbacks partition the largest shell");
  assert.ok(high.positions && high.indices.length % 3 === 0);
});

test("the single shell and the series agree at RF 1 on the shared grid", () => {
  const single = runPitShell(inputs);
  const r = runPitSeries(inputs, [1]);
  assert.ok(Math.abs(r.runs[0].oreT - single.oreT) < 1e-6 && Math.abs(r.runs[0].moneyBase - single.money) < 1e-6);
  const eco = pitEconomics(inputs), grid = buildPitGrid(inputs.cells, { slopeDeg: 45, density: 2.5, economics: eco, miningCost: 3, processingCost: 20 });
  const s = solvePit(grid, 45);
  assert.ok(Math.abs(pitValueAt(grid, s.mined, eco, 3, 20) - single.money) < 1e-6);
});

test("the schedule: years from the rate, a discounted value below the undiscounted one, the best shell found", () => {
  const r = runPitSeries(inputs, [0.6, 0.8, 1, 1.2], { rate: 20000, discountPct: 8 });
  const last = r.runs[r.runs.length - 1];
  assert.ok(Math.abs(last.years - last.rockT / 20000) < 1e-6);
  r.runs.forEach((x) => { if (x.blocks) { assert.ok(x.npv < x.undiscounted); assert.ok(Math.abs(x.undiscounted - x.moneyBase) < 1e-6); } });
  assert.ok(r.bestNpv >= 0 && r.runs[r.bestNpv].npv >= Math.max(...r.runs.map((x) => x.npv)));
  assert.ok(r.yearly.length >= 1 && Math.abs(r.yearly.reduce((a, y) => a + y.rockT, 0) - last.rockT) < 1e-6);
  const noDisc = runPitSeries(inputs, [1], { rate: 20000, discountPct: 0 });
  assert.ok(Math.abs(noDisc.runs[0].npv - noDisc.runs[0].undiscounted) < 1e-6);
});

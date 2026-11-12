// TASKS.csv #2985 (review #2876, WA iron) — on flat cells (25 x 25 x 2 m) a typed pit slope of 35-45 deg was cut with vertical walls
// ('walls 90-90°'): the arc pattern spanned 1 to 8 levels, and nothing steeper than atan(16 / 25) = 32.6 deg reached the next column.
// The levels now follow the cell shape; a slope that still gets no sideways step is said as not applied.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { precedenceArcs, wallAngles, arcLevelsFor, planCellForSlope, runPitShell, MAX_ARCS } from "../src/lib/pitShell.js";

test("#2985 on 25 x 25 x 2 m cells a typed 35, 40 or 45 deg stands within 3 deg of it, not vertical", () => {
  for (const s of [35, 40, 45]) {
    const arcs = precedenceArcs(25, 25, 2, s), w = wallAngles(25, 25, 2, s);
    assert.ok(arcs.length <= MAX_ARCS, "the arc budget holds");
    assert.ok(arcs.some(([a, b]) => a !== 0 || b !== 0), `${s}°: a sideways arc`);
    assert.ok(w.flattest >= s - 0.01 && w.steepest <= s + 3, `${s}°: walls ${w.flattest}-${w.steepest}`);
  }
});

test("#2985 cubes and near-cubes keep the 8 levels they had (their patterns unchanged)", () => {
  // the chooser asks for the typed slope + 20 deg (the steepest pattern it tries)
  for (const [dx, dz] of [[6, 6], [10, 10], [10, 8], [5, 5]]) for (const s of [25, 30, 40, 50, 60]) assert.equal(arcLevelsFor(dx, dx, dz, s + 20), 8, `${dx}x${dz} at ${s}`);
  assert.ok(arcLevelsFor(25, 25, 2, 50) > 8 && arcLevelsFor(25, 25, 2, 89) === 48);
  assert.equal(planCellForSlope(2, 40), 114);
});

test("#2985 a pit on flat cells: steeper typed slopes take less waste, never the cover alone", () => {
  // a flat bed 20-40 m deep, 8 x 8 columns of 25 m, in a 20 x 20 model of 25 x 25 x 2 m cells under a flat ground at RL 440
  const cells = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 40; k++) {
    const depth = 80 - (k + 0.5) * 2, ore = i >= 6 && i < 14 && j >= 6 && j < 14 && depth >= 20 && depth < 40;
    cells.push({ x: i * 25 + 12.5, y: j * 25 + 12.5, z: 360 + (k + 0.5) * 2, dx: 25, dy: 25, dz: 2, value: ore ? 60 : 20 });
  }
  const inputs = { unit: "%", element: "Fe", price: 1200, priceUnit: "$/t", recovery: 100, miningCost: 3, processingCost: 400, density: 2.9, revenueFactor: 1 };
  const run = (s) => runPitShell({ ...inputs, cells, slopeDeg: s }, { groundAt: () => 440 });
  const r35 = run(35), r45 = run(45), cover = 8 * 8 * 25 * 25 * 20 * 2.9;
  for (const [s, r] of [[35, r35], [45, r45]]) {
    assert.ok(r.walls.flattest < 89, `${s}°: walls ${r.walls.flattest}`);
    assert.ok(r.wasteT > cover * 1.05, `${s}°: waste ${r.wasteT} beyond the cover ${cover}`);
  }
  assert.ok(r45.wasteT < r35.wasteT, "45° takes less waste than 35°");
});

test("#2985 the pane says a slope that was not applied, and the upper slope's walls", () => {
  const p = fs.readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("res.slopeDeg < 89 && res.walls.flattest >= 89.5 ?"));
  assert.ok(p.includes('The typed {a}° slope was NOT applied: the walls are vertical.'));
  assert.ok(p.includes("upperSlope: inputs.upperSlope || null /* #2985 */"));
  const lib = fs.readFileSync(new URL("../src/lib/pitShell.js", import.meta.url), "utf8");
  assert.ok(lib.includes("walls: wallAngles(grid.dx, grid.dy, grid.dz, inputs.slopeDeg, null, inputs.sectorSlopes)"));
  assert.ok(lib.includes("upperWalls: inputs.upperSlope?.slopeDeg > 0"));
});

// TASKS.csv #1608 / #1899 — a shell that is several separate pits says so, with each part's ore, waste, strip and depth; the walls
// the drawn block steps make; the pit design can take the largest part alone
import test from "node:test";
import assert from "node:assert/strict";
import { runPitShell } from "../src/lib/pitShell.js";
import { shellFloors, benchedPit } from "../src/lib/pitDesign.js";

// 10 m cubes, 6 levels, two ore bodies 150 m apart (2 x 2 columns, the top two levels) in barren rock
function cells() {
  const out = [];
  for (let k = 0; k < 6; k++) for (let j = 0; j < 12; j++) for (let i = 0; i < 30; i++) {
    const body = k >= 4 && j >= 5 && j <= 6 && ((i >= 5 && i <= 6) || (i >= 22 && i <= 23));
    out.push({ x: 1000 + i * 10 + 5, y: 2000 + j * 10 + 5, z: 500 + k * 10 + 5, dx: 10, dy: 10, dz: 10, value: body ? 5 : 0 });
  }
  return out;
}
const inputs = { cells: cells(), unit: "g/t", element: "Au", price: 80, priceUnit: "g", recovery: 100, miningCost: 2, processingCost: 5, density: 2.5, slopeDeg: 45, revenueFactor: 1, size: null };

test("two bodies far apart give two separate pits whose ore adds up to the shell's, each two blocks deep", () => {
  const r = runPitShell(inputs);
  assert.ok(r.blocks > 0);
  assert.equal(r.parts.pits.length, 2, `${r.parts.pits.length} parts`);
  const sum = r.parts.pits.reduce((a, p) => a + p.oreT, 0);
  assert.ok(Math.abs(sum - r.oreT) < 1e-6 && Math.abs(r.parts.pits.reduce((a, p) => a + p.wasteT, 0) - r.wasteT) < 1e-6);
  assert.ok(r.parts.pits[0].oreT >= r.parts.pits[1].oreT, "largest first");
  assert.equal(r.parts.blocksDeep, 2);
  for (const p of r.parts.pits) { assert.equal(p.blocksDeep, 2); assert.ok(p.columns >= 4); assert.ok(p.stripRatio >= 0); }
  // on cubes at 45 degrees the drawn steps are one level per column: 45 degrees everywhere, in every sector the pit has a wall
  assert.ok(Math.abs(r.parts.drawnWalls.flattest - 45) < 1e-9 && Math.abs(r.parts.drawnWalls.steepest - 45) < 1e-9, `${r.parts.drawnWalls.flattest}–${r.parts.drawnWalls.steepest}`);
  for (const k of ["N", "S", "E", "W"]) assert.ok(Math.abs(r.parts.drawnWalls.bySector[k] - 45) < 1e-9, k);
});

test("the pit design can keep the largest separate pit alone", () => {
  // a shell on a 10 m lattice: a 50 x 50 m floor and, 100 m east, a 30 x 30 m floor, both at 960 under flat ground at 1,000
  const pos = [];
  for (let y = -60; y <= 60; y += 10) for (let x = -60; x <= 220; x += 10) {
    const big = Math.abs(x) <= 25 && Math.abs(y) <= 25, small = Math.abs(x - 150) <= 15 && Math.abs(y) <= 15;
    pos.push(500000 + x, 5000000 + y, big || small ? 960 : 1000);
  }
  const s = shellFloors(Float64Array.from(pos), () => 1000);
  assert.equal(s.mined, 25 + 9, "5 x 5 nodes within 25 m, 3 x 3 within 15 m");
  const all = benchedPit(s, { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60 });
  const one = benchedPit(s, { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60, largestOnly: true });
  assert.equal(all.partsDropped, 0); assert.equal(one.partsDropped, 1);
  assert.ok(one.totals.rockT < all.totals.rockT, "the small pit's rock is gone");
  // every design node east of x = 100 is at the ground: nothing was designed there
  for (let i = 0; i < one.positions.length; i += 3) if (one.positions[i] - 500000 > 100) assert.ok(one.positions[i + 2] >= 1000 - 1e-9);
});

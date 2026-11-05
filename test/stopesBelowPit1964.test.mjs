// TASKS.csv #1964 — stope outlines that start below a pit, column by column
import { test } from "node:test";
import assert from "node:assert/strict";
import { pitCeiling, ceilingLookup } from "../src/lib/pitCeiling.js";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";

// a 10 x 10 block model of 10 m blocks, 0-100 m RL, every block at grade 5
const cells = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 10; k++) cells.push({ x: 5 + 10 * i, y: 5 + 10 * j, z: 5 + 10 * k, dx: 10, dy: 10, dz: 10, value: 5 });
const model = { cells };
// a pit surface over the column centres: floor at 60 m under the west half's middle columns (i 2-4, j 3-6), 100 m (the ground) elsewhere
const floorOf = (i, j) => (i >= 2 && i <= 4 && j >= 3 && j <= 6 ? 60 : 100);
function pitMesh() {
  const pos = [], idx = [];
  for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) pos.push(5 + 10 * i, 5 + 10 * j, floorOf(i, j));
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const a = j * 10 + i, b = a + 1, c = a + 10, d = c + 1; idx.push(a, b, d, a, d, c); }
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}
const frame = { x0: 5, y0: 5, dx: 10, dy: 10, nx: 10, ny: 10 };

test("the pit read as a height field at the column centres", () => {
  const { positions, indices } = pitMesh();
  const ceil = pitCeiling(positions, indices, frame);
  assert.equal(ceil[3 * 10 + 2], 60);
  assert.equal(ceil[0], 100);
  assert.equal(ceil[9 * 10 + 9], 100);
  const at = ceilingLookup(ceil, frame);
  assert.equal(at(35, 45), 60);
  assert.ok(Number.isNaN(at(500, 500)), "outside the mesh: open");
  // a centre half-way between nodes interpolates the wall
  const half = pitCeiling(positions, indices, { x0: 20, y0: 35, dx: 10, dy: 10, nx: 1, ny: 1 });
  assert.equal(half[0], 80);
});

test("stopes start below the pit floor per column, not one RL", () => {
  const { positions, indices } = pitMesh();
  const at = ceilingLookup(pitCeiling(positions, indices, frame), frame);
  const base = { cutoff: 1, levelH: 20, zMin: 0, zMax: 100, density: 1 };
  const free = stopeOutlines(model, base);
  const under = stopeOutlines(model, { ...base, ceilingAt: at });
  // without the pit every level is a 10 x 10 stope
  assert.equal(free.levels.length, 5);
  for (const l of free.levels) assert.equal(l.stopes[0].columns, 100);
  // the 12 pit columns are shut on the 60-80 and 80-100 levels; the levels below 60 m are whole
  const by = Object.fromEntries(under.levels.map((l) => [l.rl, l.stopes.reduce((a, s) => a + s.columns, 0)]));
  assert.deepEqual(by, { 0: 100, 20: 100, 40: 100, 60: 88, 80: 88 });
  assert.equal(under.pit.shut, 24);
  // no stope solid reaches above the pit floor inside the pit's footprint
  for (const l of under.levels) for (const s of l.stopes) for (let k = 0; k < s.positions.length; k += 3) {
    const x = s.positions[k], y = s.positions[k + 1], z = s.positions[k + 2];
    if (x > 20.01 && x < 49.99 && y > 30.01 && y < 69.99) assert.ok(z <= 60 + 1e-6, `stope at ${x},${y} reaches ${z}`);
  }
});

test("a pillar keeps the stopes that far under the floor; the skin does not enter the pit", () => {
  const { positions, indices } = pitMesh();
  const at = ceilingLookup(pitCeiling(positions, indices, frame), frame);
  const r = stopeOutlines(model, { cutoff: 1, levelH: 20, zMin: 0, zMax: 100, density: 1, ceilingAt: at, pillar: 15 });
  const by = Object.fromEntries(r.levels.map((l) => [l.rl, l.stopes.reduce((a, s) => a + s.columns, 0)]));
  assert.deepEqual(by, { 0: 100, 20: 100, 40: 88, 60: 88, 80: 88 }, "the 40-60 m level is within 15 m of the 60 m floor");
  assert.equal(r.pit.pillar, 15);
  // ore only inside the pit's footprint, a skin of one column: the skin must not be put back into the shut pit columns
  const inner = { cells: cells.map((c) => ({ ...c, value: c.x > 20 && c.x < 50 && c.y > 30 && c.y < 70 ? 5 : 0 })) };
  const s = stopeOutlines(inner, { cutoff: 1, levelH: 20, zMin: 0, zMax: 100, density: 1, skin: 10, ceilingAt: at });
  const lv = Object.fromEntries(s.levels.map((l) => [l.rl, l.stopes.reduce((a, x) => a + x.columns, 0)]));
  assert.equal(lv[80], 0); assert.equal(lv[60], 0);
  assert.equal(lv[0], 30, "below the pit: 12 ore columns and an 18-column skin");
});

test("without a pit nothing changes", () => {
  const r = stopeOutlines(model, { cutoff: 1, levelH: 20, zMin: 0, zMax: 100, density: 1 });
  assert.equal(r.pit, null);
});

test("a leaning stope (a dipping vein) is checked where both its rings stand", () => {
  const { positions, indices } = pitMesh();
  const at = ceilingLookup(pitCeiling(positions, indices, frame), frame);
  const r = stopeOutlines(model, { cutoff: 1, levelH: 20, zMin: 0, zMax: 100, density: 1, dipDeg: 45, dipDirDeg: 90, ceilingAt: at });
  assert.ok(r.pit.shut > 0);
  for (const l of r.levels) for (const s of l.stopes) {
    if (!s.positions) continue;
    for (let k = 0; k < s.positions.length; k += 3) {
      const x = s.positions[k], y = s.positions[k + 1], z = s.positions[k + 2];
      // a ring vertex strictly inside the pit's footprint stands at or under its floor
      if (x > 20.01 && x < 49.99 && y > 30.01 && y < 69.99) assert.ok(z <= 60 + 1e-6, `leaning stope at ${x},${y} reaches ${z}`);
    }
  }
});

// TASKS.csv #1784 — the faster rectilinearGrid / buildExposedFaces give the same faces as a brute-force count
import { test } from "node:test";
import assert from "node:assert/strict";
import { rectilinearGrid, buildExposedFaces } from "../src/lib/voxelFaces.js";

// a tensor mesh at UTM-size coordinates (millimetre keys well past the small-integer range before the change)
const ex = [0, 30, 55, 75, 95, 115, 140, 170].map((v) => v + 612345.37), ey = [0, 20, 40, 60, 85].map((v) => v + 5543210.11), ez = [0, 10, 20, 35].map((v) => v + 600.5);
const cells = [];
for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < 7; i++) cells.push({ i, j, k, x: (ex[i] + ex[i + 1]) / 2, y: (ey[j] + ey[j + 1]) / 2, z: (ez[k] + ez[k + 1]) / 2, dx: ex[i + 1] - ex[i], dy: ey[j + 1] - ey[j], dz: ez[k + 1] - ez[k], value: (i * 7 + j * 3 + k) % 4 });

function bruteFaces(shown, boundaries) {
  const key = (c) => `${c.i},${c.j},${c.k}`, by = new Map(shown.map((c) => [key(c), c]));
  let n = 0;
  for (const c of shown) for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const nb = by.get(`${c.i + di},${c.j + dj},${c.k + dk}`);
    if (!nb || (boundaries && nb.value !== c.value && di + dj + dk > 0)) n++; // #3354 — a contact once, not from each side
  }
  return n;
}

test("the grid's edges and indices are exact at UTM coordinates", () => {
  const g = rectilinearGrid(cells);
  assert.equal(g.ex.length, 8); assert.equal(g.ey.length, 5); assert.equal(g.ez.length, 4);
  for (let t = 0; t < cells.length; t++) { assert.equal(g.I[t], cells[t].i); assert.equal(g.J[t], cells[t].j); assert.equal(g.K[t], cells[t].k); }
  for (let i = 0; i < ex.length; i++) assert.ok(Math.abs(g.ex[i] - ex[i]) < 1e-6);
});

test("faces match a brute-force count for subsets, with and without internal boundaries; no cell map for a subset in order (#3365)", () => {
  const g = rectilinearGrid(cells);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let rep = 0; rep < 12; rep++) {
    const shown = rep === 0 ? cells : cells.filter(() => rnd() > 0.4);
    for (const boundaries of [false, true]) {
      const r = buildExposedFaces(shown, g, { x: 612000, y: 5543000, z: 0 }, () => [200, 100, 50], { boundaries });
      assert.equal(r.faces, bruteFaces(shown, boundaries), `rep ${rep} boundaries ${boundaries}`);
      assert.equal(r.indices.length, r.faces * 6);
    }
    if (rep > 0) assert.equal(g.posMap, undefined, "#3365: a subset in the grid's order is matched walking both lists, no map built");
  }
});

test("a block spanning two intervals still refuses the grid", () => {
  const bad = [...cells, { x: ex[0] + 27.5, y: (ey[0] + ey[1]) / 2, z: (ez[0] + ez[1]) / 2, dx: 55, dy: 20, dz: 10, value: 1 }];
  assert.equal(rectilinearGrid(bad), null);
});

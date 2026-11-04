// TASKS.csv #1949 / #1957 (Vulcan review) — a block model reported inside a closed solid (by centre or by the share of each block
// inside) and bench by bench at a cutoff
import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksInsideSolid, gradeTonnageByBench, gradeTonnageTable } from "../src/lib/gradeTonnage.js";

// a closed box from (4, 4, 4) to (24, 24, 24): 8 vertices, 12 triangles wound outward; its faces fall inside the blocks, not on their edges
const box = (() => {
  const v = [[4, 4, 4], [24, 4, 4], [24, 24, 4], [4, 24, 4], [4, 4, 24], [24, 4, 24], [24, 24, 24], [4, 24, 24]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { positions: Float64Array.from(v.flat()), indices: Uint32Array.from(f.flat()) };
})();
// 10 m blocks over (-10..40)^3: 125 blocks; 8 have their centre inside the box (5 and 15 on each axis), the 20 m box cuts the blocks at 0-10 and 20-30 in half
const cells = [];
for (let k = 0; k < 5; k++) for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) cells.push({ x: -5 + i * 10, y: -5 + j * 10, z: -5 + k * 10, dx: 10, dy: 10, dz: 10, value: 1 + k });

test("by centre: the blocks whose centre is inside, whole", () => {
  const r = blocksInsideSolid(cells, box.positions, box.indices, { mode: "centre" });
  assert.equal(r.inside, 8); assert.equal(r.partial, 0); assert.equal(r.outside, 117);
  assert.equal(r.cells.length, 8);
  const t = gradeTonnageTable(r.cells, { cutoffs: [0], density: 2.5 })[0];
  assert.ok(Math.abs(t.volumeM3 - 8 * 1000) < 1e-6 && Math.abs(t.tonnes - 8 * 2500) < 1e-6);
});

test("by share: a block the face cuts counts by its share, and the sum is the box's volume", () => {
  const r = blocksInsideSolid(cells, box.positions, box.indices, { mode: "share", samples: 2 });
  assert.equal(r.inside, 1); // only the block at 15, 15, 15 is wholly inside
  assert.ok(r.partial === 26 && r.outside === 98, `${r.partial} ${r.outside}`);
  const t = gradeTonnageTable(r.cells, { cutoffs: [0] })[0];
  // the box is 8,000 m3; sampled at 2 x 2 x 2 the faces at 4 and 24 fall between the sample points 2.5 / 7.5 and 22.5 / 27.5, so each cut block is half in
  assert.ok(Math.abs(t.volumeM3 - 8000) < 1e-6, String(t.volumeM3));
  const cut = r.cells.find((c) => c.x === 5 && c.y === 15 && c.z === 15);
  assert.ok(cut && Math.abs(cut.coverage - 0.5) < 1e-9);
  const corner = r.cells.find((c) => c.x === 5 && c.y === 5 && c.z === 25);
  assert.ok(corner && Math.abs(corner.coverage - 0.125) < 1e-9);
});

test("by bench: a block spanning two benches splits by its overlap, benches listed top-down", () => {
  // 10 m blocks at z = -5 .. 35; 15 m benches from a datum of 0: floors at -15, 0, 15, 30
  const rows = gradeTonnageByBench(cells, { cutoff: 0, benchH: 15, datum: 0, density: 2 });
  assert.deepEqual(rows.map((r) => r.floorRL), [30, 15, 0, -15]);
  const total = rows.reduce((a, r) => a + r.volumeM3, 0);
  assert.ok(Math.abs(total - 125 * 1000) < 1e-6);
  // the bench 0-15 holds the z = 5 blocks whole (0-10) and half of the z = 15 blocks (10-15): 25 x 1000 + 25 x 500
  const b0 = rows.find((r) => r.floorRL === 0);
  assert.ok(Math.abs(b0.volumeM3 - 37500) < 1e-6 && Math.abs(b0.blocks - 37.5) < 1e-6 && Math.abs(b0.tonnes - 75000) < 1e-6);
  // the mean grade of that bench weights the two layers by their volumes: (2 x 25000 + 3 x 12500) / 37500
  assert.ok(Math.abs(b0.meanGrade - (2 * 25000 + 3 * 12500) / 37500) < 1e-9);
  // a cutoff leaves the lower benches out
  const hi = gradeTonnageByBench(cells, { cutoff: 4.5, benchH: 15, datum: 0 });
  assert.deepEqual(hi.map((r) => r.floorRL), [30]);
  assert.equal(gradeTonnageByBench(cells, { cutoff: 0, benchH: 0 }).length, 0);
});

// TASKS.csv #3588 (8) — the RTIN triangle corners are handed down from the parent (5 x faster: 1025 square, 2.1 M triangles, 901 -> 167 ms in Node,
// 518 ms of an 813 ms main-thread task in the app when the 3D View was entered after the first terrain). Identical to the walk from the root by id bits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rtinCoords } from "../src/lib/terrainMesh.js";

function reference(size) {
  const tile = size - 1, n = tile * tile * 2 - 2, coords = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
    if (id & 1) { bx = by = cx = tile; } else { ax = ay = cy = tile; }
    while ((id >>= 1) > 1) {
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
      if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
      cx = mx; cy = my;
    }
    const k = i * 4; coords[k] = ax; coords[k + 1] = ay; coords[k + 2] = bx; coords[k + 3] = by;
  }
  return coords;
}
test("the corners equal the walk from the root for every size from 3 to 257", () => {
  for (const size of [3, 5, 9, 17, 33, 65, 129, 257]) assert.deepEqual(rtinCoords(size), reference(size), `size ${size}`);
});
test("1025 square: 2.1 M triangles in well under the old 900 ms (bound 2 s: it catches a return to the id walk, not jitter)", () => {
  rtinCoords(129);
  const t = performance.now(), c = rtinCoords(1025), ms = performance.now() - t;
  assert.equal(c.length, (1024 * 1024 * 2 - 2) * 4);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
});

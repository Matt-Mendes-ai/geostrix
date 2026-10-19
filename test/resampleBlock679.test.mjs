// TASKS.csv #679 — a model solved in a trend's stretched frame, resampled onto an axis-aligned real-space grid
import { test } from "node:test";
import assert from "node:assert/strict";
import { resampleWarpedBlock, unitAt, blockToCells } from "../src/lib/modelCheck.js";

// solved block: 10 x 10 x 10 cells over 0..100 (warped frame); unit 2 ("A") below warped z = 50, id 1 (above tops) above
function solved() {
  const n = 10, ids = new Int32Array(n * n * n);
  for (let ix = 0; ix < n; ix++) for (let iy = 0; iy < n; iy++) for (let iz = 0; iz < n; iz++) ids[ix * n * n + iy * n + iz] = iz < 5 ? 2 : 1;
  return { extent: [0, 100, 0, 100, 0, 100], resolution: [n, n, n], ids, labels: [null, "A"] };
}

test("identity warp reproduces the solved block", () => {
  const r = resampleWarpedBlock(solved(), [0, 100, 0, 100, 0, 100], (p) => ({ ...p }));
  assert.deepEqual(r.resolution, [10, 10, 10]);
  assert.equal(unitAt(r, 50, 50, 20), "A");
  assert.equal(unitAt(r, 50, 50, 80), null);
});

test("a warp is applied real -> solved, and cells outside the solved box are outside the model", () => {
  // real z maps to solved z / 2: real z < 100 is unit A, real 100..200 above tops, beyond 200 outside
  const r = resampleWarpedBlock(solved(), [0, 100, 0, 100, 0, 300], (p) => ({ x: p.x, y: p.y, z: p.z / 2 }));
  assert.equal(unitAt(r, 50, 50, 60), "A");
  assert.equal(unitAt(r, 50, 50, 150), null);
  assert.equal(unitAt(r, 50, 50, 250), undefined);
  assert.ok(blockToCells(r).every((c) => c.z < 100)); // only unit A becomes block-model cells
});

test("the grid is capped", () => {
  const r = resampleWarpedBlock(solved(), [0, 1000, 0, 1000, 0, 1000], (p) => ({ ...p }), 5000);
  assert.ok(r.resolution[0] * r.resolution[1] * r.resolution[2] <= 5000);
});

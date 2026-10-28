// TASKS.csv #1029 (review #1016) — a GemPy lithology block is cut at the terrain: no unit volume, block-model cell or
// unit shell in the air above a valley.
import test from "node:test";
import assert from "node:assert/strict";
import { capBlockAtGround, unitVolumes, unitAt } from "../src/lib/modelCheck.js";

// 30 x 30 x 30 cells over 0..3000 x 0..3000 x 500..1100 m (API frame, origin 0); unit tops: A at 950, B at 850 (as the
// review's experiment); id 1 = above A's top, 2 = A, 3 = B
const N = 30, ext = [0, 3000, 0, 3000, 500, 1100];
const ids = new Int32Array(N * N * N);
for (let ix = 0; ix < N; ix++) for (let iy = 0; iy < N; iy++) for (let iz = 0; iz < N; iz++) {
  const z = 500 + (iz + 0.5) * 20;
  ids[ix * N * N + iy * N + iz] = z > 950 ? 1 : z > 850 ? 2 : 3;
}
const block = { extent: ext, resolution: [N, N, N], ids, labels: [null, "A", "B"] };
// hills at 1000 m with a N-S valley 250 m deep in the middle third
const ground = (x) => (x > 1000 && x < 2000 ? 750 : 1000);

test("#1029 cells above the ground leave the block: the valley's air is no longer unit A or B", () => {
  const before = Object.fromEntries(unitVolumes(block).map((v) => [v.name, v.volume]));
  const { block: cut, cut: n } = capBlockAtGround(block, (wx) => ground(wx), (p) => ({ ...p }));
  const after = Object.fromEntries(unitVolumes(cut).filter((v) => v.name).map((v) => [v.name, v.volume]));
  const cellVol = 100 * 100 * 20;
  // the valley (x 1000..2000: 10 columns of 30) loses A entirely (850..950 is above 750) and B from 750 up
  assert.equal(after.A, before.A * (20 / 30));
  assert.equal(after.B, before.B - 10 * 30 * 5 * cellVol); // B cells between 750 and 850: 5 per column
  assert.ok(n > 0);
  assert.equal(unitAt(cut, 1500, 1500, 900), undefined); // in the valley's air: outside the model
  assert.equal(unitAt(cut, 500, 1500, 900), "A"); // under the hill: still A
  assert.equal(unitAt(cut, 1500, 1500, 700), "B"); // under the valley floor: still B
  assert.equal(block.ids[0], 3); // the input block is not changed
});

test("#1029 no terrain where a cell is: kept; nothing to cut: the same block back", () => {
  const r = capBlockAtGround(block, () => NaN, (p) => p);
  assert.equal(r.cut, 0); assert.equal(r.block, block);
  const low = capBlockAtGround(block, () => 2000, (p) => p); // the ground above the whole box
  assert.equal(low.block, block);
});

test("#1029 a block in a stretched (trend) frame is cut through its unwarp", () => {
  // solved frame: z scaled by 2 (real z = solved z / 2); a cell at solved z 1900 is real 950
  const warped = { ...block, extent: [0, 3000, 0, 3000, 1000, 2200] };
  const { block: cut } = capBlockAtGround(warped, () => 900, (p) => ({ x: p.x, y: p.y, z: p.z / 2 }));
  for (let iz = 0; iz < N; iz++) {
    const realZ = (1000 + (iz + 0.5) * 40) / 2;
    assert.equal(cut.ids[iz] === 0, realZ > 900, `iz ${iz}`);
  }
});

// TASKS.csv #3938 — an estimate's progress is the share of the blocks WITHIN REACH done, not of the z-slices (the near-empty slices went by
// first and the time left read low, then climbed). Synthetic grids.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reachProgress, estimateBlockModel } from "../src/lib/estimation.js";

test("reachProgress: the cumulative share of the blocks in reach after each slice", () => {
  // 2 x 2 x 4: slices hold 0, 1, 3, 0 blocks in reach
  const mask = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual([...reachProgress(mask, 2, 2, 4)], [0, 0.25, 1, 1]);
  assert.equal(reachProgress(null, 2, 2, 4), null);
  assert.equal(reachProgress(new Uint8Array(16), 2, 2, 4), null); // nothing in reach: the slices' share, as before
});

test("a block estimate reports the work done: nothing for the empty slices above the samples, 1 at the end", () => {
  let k = 3; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647;
  const pts = [];
  for (let h = 0; h < 12; h++) { const x = 100 * rnd(), y = 100 * rnd(); for (let z = -20; z <= 20; z += 4) pts.push({ hole_id: `DH-${h}`, x, y, z, value: rnd(), length: 2 }); }
  const seen = [];
  estimateBlockModel(pts, { bounds: { xmin: 0, xmax: 100, ymin: 0, ymax: 100, zmin: -200, zmax: 200 }, cellSize: 10, method: "idw2", searchRadius: 25, maxBlocks: 1e6, onProgress: (f) => seen.push(f) });
  assert.equal(seen.length, 40); // one reading per slice
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
  assert.equal(seen[seen.length - 1], 1);
  assert.equal(seen[0], 0); // the top slice (z 190 m, far above every sample): no work done yet
  assert.ok(seen[15] < 0.2 && seen[24] > 0.8, seen.join(" ")); // the work is in the middle slices
});

test("wired: the block model and the dense grid report it", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/lib/estimation.js", import.meta.url), "utf8");
  assert.match(src, /opts\.onProgress\?\.\(doneAfter \? doneAfter\[iz\] : \(iz \+ 1\) \/ nz\)/);
  assert.match(src, /opts\.onProgress\?\.\(denseDone \? denseDone\[iz\] : \(iz \+ 1\) \/ nz\)/);
});

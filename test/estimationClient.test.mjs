// TASKS.csv #520 — estimation off the UI thread: the client gives exactly the estimator's result, reports progress per
// z-slice and honours an abort. (Node has no Worker, so this exercises the inline fallback the app uses when a
// worker cannot start; the worker itself is checked live in the app.)
import test from "node:test";
import assert from "node:assert/strict";
import { runEstimation } from "../src/lib/estimationClient.js";
import { estimateBlockModel, estimateDenseGrid } from "../src/lib/estimation.js";

const pts = [];
for (let h = 0; h < 6; h++) for (let d = 0; d < 20; d++) pts.push({ x: h * 40, y: (h % 2) * 30, z: -d * 5, value: 1 + ((h * 7 + d) % 5), hole_id: `H${h}` });
const opts = { bounds: { xmin: -20, xmax: 220, ymin: -20, ymax: 50, zmin: -100, zmax: 0 }, cellSize: { dx: 20, dy: 20, dz: 10 }, method: "idw2", searchRadius: 80, minSamples: 1, maxSamples: 8 };

test("#520 block and dense results equal the direct estimator; progress once per z-slice ending at 1", async () => {
  const seen = [];
  const block = await runEstimation("block", pts, opts, { onProgress: (f) => seen.push(f) });
  assert.deepEqual(block, estimateBlockModel(pts, opts));
  assert.equal(seen.length, block.grid.nz);
  assert.equal(seen[seen.length - 1], 1);
  const dense = await runEstimation("dense", pts, { ...opts, support: true });
  const direct = estimateDenseGrid(pts, { ...opts, support: true });
  assert.deepEqual([...dense.values], [...direct.values]);
  assert.equal(dense.estimated, direct.estimated);
  assert.deepEqual(dense.supportCounts, direct.supportCounts);
});

test("#520 an already-aborted signal rejects as cancelled", async () => {
  const ac = new AbortController(); ac.abort();
  await assert.rejects(runEstimation("block", pts, opts, { signal: ac.signal }), (e) => e.cancelled === true);
});

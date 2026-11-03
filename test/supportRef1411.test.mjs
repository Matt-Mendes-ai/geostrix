// TASKS.csv #1411 — no search radius: blocks far from every sample are unsupported, against a reference distance from the data
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel } from "../src/lib/estimation.js";

const holes = [[0, 0], [50, 0], [0, 50], [50, 50]];
const pts = holes.flatMap(([x, y], h) => Array.from({ length: 10 }, (_, i) => ({ x, y, z: -i * 5, value: 1 + h, hole_id: `H${h}` })));
const opts = { bounds: { xmin: -500, xmax: 550, ymin: -500, ymax: 550, zmin: -50, zmax: 0 }, cellSize: { dx: 50, dy: 50, dz: 50 }, method: "idw2", searchRadius: 5000, support: true };

test("without supportRef nothing is unsupported; with it, far blocks are, near and bracketed ones are not", () => {
  const plain = estimateBlockModel(pts, opts);
  assert.equal(plain.supportCounts.unsupported, 0);
  const ref = estimateBlockModel(pts, { ...opts, supportRef: 100 });
  assert.ok(ref.supportCounts.unsupported > 0.5 * ref.blocksEstimated, JSON.stringify(ref.supportCounts));
  assert.equal(ref.supportCounts.interpolated, plain.supportCounts.interpolated, "interpolated blocks are never reclassed");
  const near = ref.cells.find((c) => Math.abs(c.x - 25) < 1 && Math.abs(c.y - 25) < 1);
  assert.notEqual(near?.support, "unsupported");
  const far = ref.cells.find((c) => c.x < -400 && c.y < -400);
  assert.equal(far.support, "unsupported");
  assert.ok(far.supportIndex < 0.2, String(far.supportIndex));
});

// TASKS.csv #2694 (split from #2636) — the estimator's own reach count (estimation.js) used one sphere per composite; it now uses each
// hole's contiguous composites as segments (#2636's approach, lib/blockReach.js), widened by a small tolerance: no reached block is left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockReach, segmentReach, compositesToSegments } from "../src/lib/blockReach.js";
import { estimateBlockModel } from "../src/lib/estimation.js";

let s = 2694; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const pts = [];
for (let h = 0; h < 12; h++) {
  const cx = (h % 4) * 90, cy = Math.floor(h / 4) * 90, ix = (r() - 0.5) * 0.5;
  for (let i = 0; i < 60; i++) { if (i === 30) continue; const md = i * 2 + 1; pts.push({ hole_id: "H" + h, from: i * 2, to: i * 2 + 2, length: 2, x: cx + ix * md, y: cy, z: 200 - md, value: 1 + r() }); }
}
const bounds = { xmin: -60, xmax: 330, ymin: -60, ymax: 240, zmin: 60, zmax: 220 };

test("runs break at a sample gap; a straight run is one segment", () => {
  const segs = compositesToSegments(pts, 1);
  assert.equal(segs.length, 24, "12 holes x 2 runs (the gap at 60-62 m), each straight: one segment");
  assert.deepEqual(compositesToSegments([{ x: 1, y: 2, z: 3 }]), [[1, 2, 3, 1, 2, 3]], "a composite with no hole: a point");
});

test("the segment mask holds every block the spheres held", () => {
  const cell = { dx: 10, dy: 10, dz: 5 }, tol = 5 / 8;
  const a = blockReach(pts, bounds, cell, 60), b = segmentReach(compositesToSegments(pts, tol), bounds, cell, 60, { margin: tol });
  let missing = 0; for (let i = 0; i < a.mask.length; i++) if (a.mask[i] && !b.mask[i]) missing++;
  assert.equal(missing, 0);
  assert.ok(b.reach >= a.reach && b.reach < a.reach * 1.05, `${a.reach} -> ${b.reach}`);
});

test("estimates are unchanged by the mask (as #1416 checks against noReach)", () => {
  const base = { bounds, cellSize: { dx: 10, dy: 10, dz: 5 }, searchRadius: 60, minSamples: 1, maxSamples: 12, method: "idw2" };
  const a = estimateBlockModel(pts, base), b = estimateBlockModel(pts, { ...base, noReach: true });
  assert.equal(a.blocksEstimated, b.blocksEstimated);
  assert.ok(a.blocksInReach < b.blocksInReach);
  const e = readFileSync(new URL("../src/lib/estimation.js", import.meta.url), "utf8");
  assert.match(e, /return segmentReach\(compositesToSegments\(points, tol\), bounds, cell, R, \{ margin: tol, rz \}\);/);
});

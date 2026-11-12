// TASKS.csv #1843 (review #1754, Kodiak) — 'Downhole only' refused to run without collars ('No composite could be placed in 3D') although
// downhole pairs need only the depths: 6,239 assays in 33 holes could give the Cu / Au nugget. Holes that cannot be placed in 3D are
// now placed by depth along the hole in that mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { downholeLinePoints, experimentalVariogram } from "../src/lib/variogram.js";

const intervals = [];
for (const h of ["K1", "K2", "K3"]) for (let d = 0; d < 60; d++) intervals.push({ hole_id: h, from: d * 2, to: d * 2 + 2, avgGrade: Math.sin(d / 3) + 2, length: 2 });

test("composites of unplaced holes go on a line by depth, one line per hole", () => {
  const r = downholeLinePoints(intervals, new Set(["K3"]));
  assert.equal(r.holes, 2);
  assert.equal(r.points.length, 120);
  const k1 = r.points.filter((p) => p.hole_id === "K1"), k2 = r.points.filter((p) => p.hole_id === "K2");
  assert.equal(k1[0].z, -1); assert.equal(k1[1].z - k1[0].z, -2, "2 m apart down the hole");
  assert.ok(Math.abs(k2[0].x - k1[0].x) >= 1e5, "holes far apart");
  assert.ok(r.points.every((p) => p.byDepth && p.length === 2));
  assert.equal(downholeLinePoints([{ hole_id: "X", from: 0, to: 1, avgGrade: null }]).points.length, 0, "no grade: left out");
});

test("a downhole variogram runs on them, with pairs from the first lag", () => {
  const { points } = downholeLinePoints(intervals);
  const vg = experimentalVariogram(points, { lagDistance: 2, nLags: 10, lagTolerance: 1, holeMode: "downhole" });
  assert.ok(vg.bins[0].nPairs >= 150, "3 holes x 59 neighbouring pairs: " + vg.bins[0].nPairs);
  assert.equal(vg.reliableFromLag, 2);
});

test("the dialog places them only for Downhole only, and says so", () => {
  const m = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const byDepth = holeMode === "downhole" \? downholeLinePoints\(intervals, new Set\(placed3d\.map\(\(p\) => p\.hole_id\)\)\) : \{ points: \[\], holes: 0 \};/);
  assert.match(m, /const dropped = Math\.max\(0, dropped3d - byDepth\.points\.length\);/);
  assert.match(m, /result\.byDepthHoles > 0 && <div/);
});

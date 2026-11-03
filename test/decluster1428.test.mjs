// TASKS.csv #1428 — Voronoi declustering of a perfectly regular grid gives back the naive mean
import { test } from "node:test";
import assert from "node:assert/strict";
import { declusteredStats } from "../src/lib/geoprocessing.js";

test("a regular 21 x 21 grid: every cell the same area, declustered mean = naive mean", () => {
  const pts = [];
  for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) pts.push({ x: i * 80, y: j * 80, value: (i * 7 + j * 3) % 11 });
  const r = declusteredStats(pts);
  assert.ok(Math.abs(r.declusteredMean - r.naiveMean) < 1e-9, `${r.declusteredMean} vs ${r.naiveMean}`);
});

test("a cluster still gets down-weighted", () => {
  const pts = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) pts.push({ x: i * 100, y: j * 100, value: 1 });
  for (let k = 0; k < 50; k++) pts.push({ x: 450 + (k % 7) * 3, y: 450 + Math.floor(k / 7) * 3, value: 10 });
  const r = declusteredStats(pts);
  assert.ok(r.naiveMean > 3.9 && r.declusteredMean < 1.3, `${r.naiveMean} ${r.declusteredMean}`);
});

test("#1427: a model 870 km from the collars is measured as such; one over them is 0", async () => {
  const { modelGapKm } = await import("../src/lib/dataClusters.js");
  const collars = [{ x: 425000, y: 6642000 }, { x: 426000, y: 6643000 }];
  assert.ok(modelGapKm([{ x: 1295000, y: 6642000 }], collars) > 860);
  assert.equal(modelGapKm([{ x: 425500, y: 6642500 }], collars), 0);
  assert.equal(modelGapKm([], collars), null);
  assert.equal(modelGapKm([{ x: 0, y: 0 }], [], null), null);
});

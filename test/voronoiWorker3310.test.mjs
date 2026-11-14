// TASKS.csv #3310 (review #3195, Galore Creek) — Spatial analysis froze 17-43 s on a quarter-million-point IP cloud: one pass over flat arrays
// (lib/voronoiDecluster.js) in a worker, with the same answers as geoprocessing's declusteredStats
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voronoiDecluster, mapTransform, ASK_FROM, robustStretch, drawDecluster, rampRGB } from "../src/lib/voronoiDecluster.js";
import { robustRange } from "../src/lib/geophysSurveys.js";
import { declusteredStats, paddedBounds } from "../src/lib/geoprocessing.js";

let seed = 3310; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cloud = (n) => {
  const pts = [];
  for (let i = 0; i < n; i++) { const c = i < n / 3; pts.push({ x: c ? 100 + rnd() * 20 : rnd() * 1000, y: c ? 100 + rnd() * 20 : rnd() * 800, value: c ? 50 + rnd() * 10 : 5 + rnd() * 10 }); }
  pts.push({ ...pts[3], value: 99 }, { ...pts[10], value: 1 }); // two at another point's plan position
  pts.push({ x: 500, y: 400, value: NaN });
  return pts;
};
const arrays = (pts) => ({ xs: Float64Array.from(pts, (p) => p.x), ys: Float64Array.from(pts, (p) => p.y), vs: Float64Array.from(pts, (p) => (Number.isFinite(p.value) ? p.value : NaN)) });

test("the same statistics as declusteredStats, clustered data, coincident points and a point with no value", () => {
  const pts = cloud(3000), b = paddedBounds(pts);
  const old = declusteredStats(pts, b);
  const { xs, ys, vs } = arrays(pts);
  const phases = [];
  const r = voronoiDecluster(xs, ys, vs, b, { onProgress: (d, t, p) => phases.push(p), every: -1 });
  assert.equal(r.n, old.n);
  assert.ok(Math.abs(r.totalArea - old.totalArea) / old.totalArea < 1e-9);
  assert.ok(Math.abs(r.naiveMean - old.naiveMean) < 1e-9);
  assert.ok(Math.abs(r.declusteredMean - old.declusteredMean) < 1e-9, `${r.declusteredMean} vs ${old.declusteredMean}`);
  assert.ok(Math.abs(r.declusteredStd - old.declusteredStd) < 1e-9);
  assert.ok(r.declusteredMean < r.naiveMean, "the cluster's high values weigh less");
  assert.deepEqual([...new Set(phases)], ["triangulate", "cells"]);
  const byIndex = old.cells.reduce((m, c) => m.set(c.index, c.area), new Map());
  for (const i of [0, 5, 1500, 2999]) assert.ok(Math.abs(r.areas[i] - byIndex.get(i)) < 1e-6 * byIndex.get(i), `cell ${i}`);
});

test("the worker's colour stretch is robustRange's 2-98 % rule", () => {
  const vals = [...Array.from({ length: 98 }, (_, i) => 56000 + i), 2105, 167300, NaN];
  assert.deepEqual(robustStretch(Float64Array.from(vals)), robustRange(vals));
  assert.deepEqual(robustStretch(Float64Array.from([3, 1, 2])), robustRange([3, 1, 2]));
});

test("the map: each pixel takes its nearest point's colour class (two points: low on the west, high on the east)", () => {
  const xs = Float64Array.from([0, 100]), ys = Float64Array.from([0, 0]), vs = Float64Array.from([0, 1]);
  const bounds = { xmin: -50, ymin: -50, xmax: 150, ymax: 50 };
  const r = voronoiDecluster(xs, ys, vs, bounds);
  let img = null;
  const ctx = { createImageData: (W, H) => (img = { W, H, data: new Uint8ClampedArray(W * H * 4) }), putImageData() {}, setTransform() {}, beginPath() {}, stroke() {}, fill() {}, arc() {}, moveTo() {}, lineTo() {}, closePath() {} };
  drawDecluster(ctx, { delaunay: r.delaunay, voronoi: r.voronoi, xs, ys, vs, areas: r.areas, bounds, w: 200, h: 100, pad: 0, vmin: 0, vrange: 1 });
  const at = (px, py) => Array.from(img.data.slice((py * img.W + px) * 4, (py * img.W + px) * 4 + 4));
  assert.deepEqual(at(10, 50), [...rampRGB(0.5 / 64), 217]);
  assert.deepEqual(at(190, 50), [...rampRGB(63.5 / 64), 217]);
});

test("map px and world round-trip; north up", () => {
  const t = mapTransform({ xmin: 0, ymin: 0, xmax: 100, ymax: 50 }, 560, 460, 16);
  const [px, py] = t.toPx(25, 40), [x, y] = t.toWorld(px, py);
  assert.ok(Math.abs(x - 25) < 1e-9 && Math.abs(y - 40) < 1e-9);
  assert.ok(t.toPx(0, 50)[1] < t.toPx(0, 0)[1]);
});

test("wiring: the dialog asks first on a large or 3D cloud, runs in the worker with progress and Cancel, and never builds SVG cells", () => {
  const s = readFileSync(new URL("../src/components/SpatialAnalysis.jsx", import.meta.url), "utf8");
  assert.ok(ASK_FROM >= 10000);
  assert.match(s, /const askFirst = sliced\.length > ASK_FROM \|\| !!shape\?\.is3D;/);
  assert.match(s, /new Worker\(new URL\("\.\.\/lib\/voronoi\.worker\.js", import\.meta\.url\), \{ type: "module" \}\)/);
  assert.match(s, /onClick=\{cancel\}/);
  assert.doesNotMatch(s, /voronoiTessellation|declusteredStats|<polygon/);
});

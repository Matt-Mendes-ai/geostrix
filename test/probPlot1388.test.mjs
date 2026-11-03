// TASKS.csv #1388 — Grade statistics' length-weighted log-probability plot, with the caps Compositing suggests
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { weightedProbPoints, weightedPercentile, capEffect } from "../src/lib/probPlot.js";
import { lengthWeightedPercentile, resolvedSegments } from "../src/lib/geochem.js";
import { normalQuantile } from "../src/lib/thresholds.js";

test("plotting positions are the share of length below each sample's middle; zeros count but are not drawn", () => {
  const { points, excluded } = weightedProbPoints([0, 10, 1, 100], [2, 1, 1, 4]); // sorted: 0(2) 1(1) 10(1) 100(4), total 8
  assert.equal(excluded, 1);
  assert.equal(points.length, 3);
  assert.ok(Math.abs(points[0][0] - normalQuantile(2.5 / 8)) < 1e-12);
  assert.ok(Math.abs(points[2][0] - normalQuantile(6 / 8)) < 1e-12);
  assert.deepEqual(points.map((p) => p[1]), [0, 1, 2]);
});

test("unweighted: every sample counts once", () => {
  const { points } = weightedProbPoints([1, 10, 100]);
  assert.ok(Math.abs(points[1][0]) < 1e-12); // the middle sample sits at 50 %
});

test("the percentiles are Compositing's (lengthWeightedPercentile) on the same assays", () => {
  const assays = [];
  for (let i = 0; i < 200; i++) assays.push({ hole_id: `H${i % 7}`, from: i * 2, to: i * 2 + 0.5 + (i % 5) * 0.4, values: { Ag: [0.2 + ((i * 37) % 97) / 3] } });
  const eu = { Ag: "ppm" };
  const segs = resolvedSegments(assays, "Ag", "ppm", eu);
  const vs = segs.map((s) => s.value), ws = segs.map((s) => s.to - s.from);
  for (const p of [97.5, 99]) assert.equal(weightedPercentile(vs, ws, p), lengthWeightedPercentile(assays, "Ag", "ppm", eu, p));
});

test("a cap's effect: samples above it and the metal (grade x length) removed", () => {
  const fx = capEffect([1, 2, 50], [1, 1, 2], 10); // metal 1 + 2 + 100 = 103; removed (50 - 10) x 2 = 80
  assert.equal(fx.above, 1);
  assert.equal(fx.n, 3);
  assert.ok(Math.abs(fx.pctMetalRemoved - (100 * 80) / 103) < 1e-9);
});

test("Grade statistics draws the plot with the P97.5 / P99 lines and a cap to test", () => {
  const src = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(src, /<ProbPlot prob=\{prob\} cap=\{capFx \? capValue : null\}/);
  assert.match(src, /p975: weightedPercentile\(vs, ws, 97\.5\), p99: weightedPercentile\(vs, ws, 99\)/);
  assert.match(src, /aria-label=\{tr\("Cap to test"\)\}/);
});

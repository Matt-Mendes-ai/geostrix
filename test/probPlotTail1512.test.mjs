// TASKS.csv #1512 — the log-probability plot keeps its high-grade tail: one point per pixel, not every Nth by rank
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { weightedProbPoints, thinToPixels } from "../src/lib/probPlot.js";

test("83,670 log-normal values plus a 136 g/t outlier: few points drawn, the maximum among them", () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const vals = Array.from({ length: 83669 }, () => Math.exp(-2.5 + 1.4 * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd())));
  vals.push(136);
  const { points } = weightedProbPoints(vals);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const X = (v) => 46 + ((v - x0) / (x1 - x0)) * 504, Y = (v) => 194 - ((v - y0) / (y1 - y0)) * 186; // the plot's 640 x 220 frame
  const shown = thinToPixels(points, X, Y);
  assert.ok(shown.length < 4000, `${shown.length} points`);
  const top = shown.reduce((m, p) => Math.max(m, p[1]), -Infinity);
  assert.ok(Math.abs(10 ** top - 136) < 1e-9);
  // every pixel the top 0.1 % of points falls on has a dot (points on the same pixel are one dot on screen)
  const key = (p) => `${Math.round(X(p[0]))},${Math.round(Y(p[1]))}`, drawn = new Set(shown.map(key));
  assert.ok(points.slice(-84).every((p) => drawn.has(key(p))));
});

test("Grade statistics draws through thinToPixels", () => {
  const src = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(src, /thinToPixels\(s\.points, X, Y\)\.map/);
  assert.doesNotMatch(src, /Math\.floor\(s\.points\.length \/ 600\)/);
});

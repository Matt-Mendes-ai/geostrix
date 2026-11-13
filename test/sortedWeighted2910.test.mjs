// TASKS.csv #2910 (review #2876, WA iron) — Grade stats sorted the same 147,000 values five times per choice, each an array of pairs with a
// comparator (three percentiles 1.4 s, the break's summary 0.65 s, the probability points 0.43 s, computeStats 0.43 s per group). One
// native sort (arrayStats.js sortedWeighted) now serves them, with the results of the stable comparator sort it replaces.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sortedWeighted } from "../src/lib/arrayStats.js";
import { weightedPercentile, weightedProbPoints } from "../src/lib/probPlot.js";
import { normalQuantile, probabilityBreak, populationSummary } from "../src/lib/thresholds.js";

let seed = 2910; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const data = (n) => Array.from({ length: n }, () => { const r = rnd(); return r < 0.05 ? 0 : r < 0.07 ? -1 : r < 0.3 ? Math.round(10 * Math.exp(3 * rnd() - 2)) / 10 : Math.exp(4 * rnd() - 3); });
const wts = (n) => Array.from({ length: n }, () => (rnd() < 0.1 ? 0 : rnd() < 0.7 ? 2 : 0.5 + rnd()));

// the replaced code, as references
const refPairs = (values, weights) => (values || []).map((v, i) => [Number(v), weights ? Number(weights[i]) : 1]).filter(([v, w]) => Number.isFinite(v) && w > 0).sort((a, b) => a[0] - b[0]);
const refPercentile = (values, weights, p) => { const pairs = refPairs(values, weights); const total = pairs.reduce((t, x) => t + x[1], 0); if (!total) return null; const target = (p / 100) * total; let acc = 0; for (const [v, w] of pairs) { acc += w; if (acc >= target - 1e-9) return v; } return pairs[pairs.length - 1][0]; };
const refPoints = (values, weights, log = true) => { const pairs = refPairs(values, weights); const total = pairs.reduce((t, p) => t + p[1], 0); const points = []; let acc = 0, excluded = 0; for (const [v, w] of pairs) { const pos = (acc + w / 2) / total; acc += w; if (!log) points.push([normalQuantile(pos), v]); else if (v > 0) points.push([normalQuantile(pos), Math.log10(v)]); else excluded++; } return { points, excluded }; };

test("sortedWeighted is a stable sort by value: equal values keep their input order with their weights", () => {
  const v = [3, 1, 2, 1, 3, 1], w = [10, 20, 30, 40, 50, 60];
  const s = sortedWeighted(v, w);
  assert.deepEqual(Array.from(s.v), [1, 1, 1, 2, 3, 3]);
  assert.deepEqual(Array.from(s.w), [20, 40, 60, 30, 10, 50]);
  assert.equal(s.total, 210);
  assert.equal(sortedWeighted(v, w), s, "cached for the same arrays");
  assert.equal(sortedWeighted(v, w, { keepZero: true }), s, "no zero weight: keepZero changes nothing, the same result");
  assert.equal(sortedWeighted(v, w, { coerce: true }), s, "only numbers: coerce changes nothing, the same result");
  const z = [1, 2, 3], zw = [1, 0, 2];
  assert.notEqual(sortedWeighted(z, zw, { keepZero: true }), sortedWeighted(z, zw), "a zero weight: kept apart");
  const nn = [1, null, 3];
  assert.notEqual(sortedWeighted(nn, null, { coerce: true }), sortedWeighted(nn, null), "a value that is not a number: kept apart");
  assert.deepEqual(Array.from(sortedWeighted([2, null, "1", NaN, 5], null).v), [2, 5], "numbers only by default");
  assert.deepEqual(Array.from(sortedWeighted([2, null, "1", NaN, 5], null, { coerce: true }).v), [0, 1, 2, 5], "Number() as the old probPlot code");
  assert.deepEqual(Array.from(sortedWeighted([1, 2, 3], [1, 0, 2]).v), [1, 3]);
  assert.deepEqual(Array.from(sortedWeighted([1, 2, 3], [1, 0, 2], { keepZero: true }).v), [1, 2, 3]);
});

test("the percentiles and the probability points equal the replaced code on random data with ties, zeros and negatives", () => {
  for (let t = 0; t < 30; t++) {
    const n = 20 + Math.floor(rnd() * 1500), v = data(n), w = t % 3 ? wts(n) : null;
    for (const p of [50, 90, 97.5, 99]) assert.equal(weightedPercentile(v, w, p), refPercentile(v, w, p), `trial ${t} P${p}`);
    for (const log of [true, false]) assert.deepEqual(weightedProbPoints(v, w, { log }), refPoints(v, w, log), `trial ${t} log ${log}`);
  }
});

test("the weighted summary behind the probability-plot break keeps its values (sorted positive values and their weights)", () => {
  const v = data(800), w = wts(800);
  const s = populationSummary(v, 0, w);
  const ref = refPairs(v, w).filter(([x]) => x > 0);
  assert.deepEqual(s.sorted, ref.map((p) => p[0]));
  assert.deepEqual(s.weights, ref.map((p) => p[1]));
  assert.ok(Array.isArray(s.sorted) && Array.isArray(s.sortedLog), "plain arrays, as candidateThresholds maps them");
  const two = [...Array.from({ length: 480 }, (_, i) => 10 ** (Math.log10(30) + 0.2 * normalQuantile((i + 0.5) / 480))), ...Array.from({ length: 20 }, (_, i) => 10 ** (Math.log10(300) + 0.15 * normalQuantile((i + 0.5) / 20)))];
  const b = probabilityBreak(two, two.map(() => 2));
  assert.ok(b > 60 && b < 300, String(b));
});

test("Grade stats' computeStats reads the shared sort", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /const sw = sortedWeighted\(values, w, \{ keepZero: true \}\), scale = n \/ V1, sorted = sw\.v;/);
  assert.doesNotMatch(g, /values\.map\(\(v, i\) => \(\{ v, w: \(w\[i\] \* n\) \/ V1 \}\)\)\.sort/);
});

test("a large X-Y plot says it is drawing until its picture is in (the frame was empty for 3 s under 'samples plotted')", () => {
  const g = readFileSync(new URL("../src/components/GeochemPlot.jsx", import.meta.url), "utf8");
  assert.match(g, /return href \? <image href=\{href\}[^\n]*: <text [^\n]*data-drawing="1">\{tr\("Drawing \{n\} samples…", \{ n: ordered\.length\.toLocaleString\(\) \}\)\}<\/text>;/);
});

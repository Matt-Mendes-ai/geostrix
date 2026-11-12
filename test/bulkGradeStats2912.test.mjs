// TASKS.csv #2912 (review #2876, WA bedded iron) — Grade stats on a bulk commodity: the scale follows the skew, the probability plot follows
// the histogram's scale, the break is offered as a cap only on a skewed grade above its median, and an 'Above cut-off' table
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { histogramWantsLog } from "../src/lib/geochem.js";
import { weightedProbPoints } from "../src/lib/probPlot.js";
import { normalQuantile } from "../src/lib/thresholds.js";
import { overlapMeans, aboveCutoffRows, parseCutoffs, defaultCutoffs } from "../src/lib/cutoffTable.js";

const normal = (n, mean, sd) => Array.from({ length: n }, (_, i) => mean + sd * normalQuantile((i + 0.5) / n));
const lognormal = (n, med, sd) => Array.from({ length: n }, (_, i) => 10 ** (Math.log10(med) + sd * normalQuantile((i + 0.5) / n)));
const statsOf = (vals) => {
  const sorted = [...vals].sort((a, b) => a - b), n = sorted.length, mean = sorted.reduce((t, v) => t + v, 0) / n;
  const sd = Math.sqrt(sorted.reduce((t, v) => t + (v - mean) ** 2, 0) / (n - 1));
  return { sorted, cv: (100 * sd) / mean };
};

test("a bimodal major spanning 0.8 to 95 % stays linear; a log-normal trace metal over the same range opens on log", () => {
  // SiO2 of a bedded iron: ore near 6 %, waste near 45 % (mean about 29 %, as the review's), a few cherts to 95 % and a few 0.8 % samples
  const sio2 = [...normal(400, 6, 2).map((v) => Math.max(0.8, v)), ...normal(600, 45, 12), 95, 92, 0.8];
  const st = statsOf(sio2);
  assert.ok(st.sorted.at(-1) / st.sorted.find((v) => v > 0) > 100, "over two decades");
  assert.ok(st.cv < 150);
  assert.equal(histogramWantsLog(st), false);
  for (const sd of [0.35, 0.5, 0.8]) assert.equal(histogramWantsLog(statsOf(lognormal(1000, 30, sd))), true, `log SD ${sd}`);
});

test("the old rules hold: a CV above 150 % is log, a narrow normal grade is linear", () => {
  assert.equal(histogramWantsLog({ sorted: [1, 2, 3, 4, 50], cv: 160 }), true);
  assert.equal(histogramWantsLog({ sorted: [1.2, 1.9, 2.4, 3.1], cv: 35 }), false);
  assert.equal(histogramWantsLog({ sorted: [0.5, 1, 2, 60], cv: 120 }), true);
});

test("the arithmetic probability plot draws the values themselves, zeros included", () => {
  const { points, excluded } = weightedProbPoints([0, 10, 20, 30], null, { log: false });
  assert.equal(excluded, 0);
  assert.deepEqual(points.map((p) => p[1]), [0, 10, 20, 30]);
  assert.ok(points[0][0] < 0 && points[3][0] > 0);
  const lg = weightedProbPoints([0, 10, 100]);
  assert.equal(lg.excluded, 1);
  assert.deepEqual(lg.points.map((p) => p[1]), [1, 2]);
});

test("overlapMeans: the length-weighted mean of another element over each sample, by hole", () => {
  const main = [{ hole_id: "A", from: 0, to: 2, value: 60 }, { hole_id: "A", from: 2, to: 4, value: 40 }, { hole_id: "B", from: 0, to: 1, value: 55 }];
  const sio2 = [{ hole_id: "A", from: 0, to: 1, value: 4 }, { hole_id: "A", from: 1, to: 3, value: 10 }, { hole_id: "A", from: 3, to: 4, value: 30 }];
  const m = overlapMeans(main, sio2);
  assert.equal(m[0], (1 * 4 + 1 * 10) / 2);
  assert.equal(m[1], (1 * 10 + 1 * 30) / 2);
  assert.ok(Number.isNaN(m[2]), "hole B has no SiO2");
});

test("aboveCutoffRows: n, metres, the mean grade and the penalty element above each cut-off", () => {
  const fe = [60, 40, 55, 20], len = [2, 2, 1, 5], sio2 = [7, 25, NaN, 50];
  const rows = aboveCutoffRows(fe, len, [55, 50, 50], { weighted: true, also: { Si: sio2 } });
  assert.deepEqual(rows.map((r) => r.cutoff), [50, 55], "sorted, repeats dropped");
  const r = rows[0];
  assert.equal(r.n, 2); assert.equal(r.pctN, 50);
  assert.equal(r.length, 3); assert.equal(r.pctLength, 30);
  assert.equal(r.mean, (60 * 2 + 55 * 1) / 3);
  assert.equal(r.also.Si, 7, "only the sample with an SiO2 value");
  const u = aboveCutoffRows(fe, null, [30], { also: { Si: sio2 } })[0];
  assert.equal(u.length, null); assert.equal(u.mean, (60 + 40 + 55) / 3); assert.equal(u.also.Si, 16);
  assert.equal(aboveCutoffRows(fe, len, [99])[0].mean, null);
});

test("cut-offs: typed text read leniently; the defaults are the data's median, Q3 and P90 to two figures", () => {
  assert.deepEqual(parseCutoffs("50, 55;60  x"), [50, 55, 60]);
  assert.deepEqual(parseCutoffs(""), []);
  assert.deepEqual(defaultCutoffs({ median: 43.27, q3: 55.81, p90: 59.96 }), [43, 56, 60]);
  assert.deepEqual(defaultCutoffs({ median: 0, q3: 0.0123, p90: 0.0123 }), [0.012]);
});

test("Grade stats wiring: the plot follows the histogram's scale, the break is a cap only when skewed and above the median, the table", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /weightedProbPoints\(rs\.map\(\(r\) => r\.value\), weightingActive \? rs\.map\(\(r\) => r\.weight\) : null, \{ log: logScale \}\)/);
  assert.match(g, /const brkAsCap = prob\.brk > 0 && prob\.log && overallStats && prob\.brk > overallStats\.median;/);
  assert.match(g, /\{brkAsCap && <button type="button" onClick=\{\(\) => setCapTest/);
  assert.match(g, /aboveCutoffRows\(allValues, rows\.map\(\(r\) => r\.weight\), cutoffs, \{ weighted: weightingActive, also \}\)/);
  assert.match(g, /const allValues = useMemo\(\(\) => rows\.map\(\(r\) => r\.value\), \[rows\]\);/);
  // the scale is settled before the probability plot reads it
  assert.ok(g.indexOf("const logScale =") < g.indexOf("const prob = useMemo"));
});

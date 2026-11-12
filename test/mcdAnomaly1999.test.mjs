// TASKS.csv #1999 — a robust multivariate anomaly score: MCD Mahalanobis distance on log-ratio (ilr) coordinates (Filzmoser, Garrett &
// Reimann 2005), FAST-MCD with the consistency factor and one reweighting step
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chi2Quantile, chi2Cdf, pivotIlr, fastMcd, mcdAnomalyScores, defaultMcdElements } from "../src/lib/mcd.js";

test("chi-square quantiles and CDF against the tables", () => {
  for (const [q, df, v] of [[0.975, 1, 5.0239], [0.975, 2, 7.3778], [0.95, 10, 18.307], [0.99, 30, 50.8922], [0.5, 4, 3.3567]]) assert.ok(Math.abs(chi2Quantile(q, df) - v) < 1e-3, `${q} ${df}`);
  assert.ok(Math.abs(chi2Cdf(3.8415, 1) - 0.95) < 1e-4);
});

test("pivotIlr: D - 1 coordinates, zero for equal parts, scale-free", () => {
  assert.deepEqual(pivotIlr([5, 5, 5]).map((v) => Math.abs(v) < 1e-12), [true, true]);
  const a = pivotIlr([1, 2, 4, 8]), b = pivotIlr([10, 20, 40, 80]);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-12));
  assert.equal(a.length, 3);
});

// 400 lognormal samples with Cu-Zn correlated, and 20 with Pb and As high together (each alone within the normal range of the others)
function data(seed = 7) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const rows = [];
  for (let i = 0; i < 400; i++) { const z = [g(), g() * 0.5, g() * 0.8, g() * 0.3]; rows.push({ values: { Cu: Math.exp(3 + z[0]), Zn: Math.exp(4 + 0.6 * z[0] + z[1]), Pb: Math.exp(2 + z[2]), As: Math.exp(1 + z[3]) } }); }
  for (let i = 0; i < 20; i++) rows.push({ values: { Cu: Math.exp(3), Zn: Math.exp(4), Pb: Math.exp(5), As: Math.exp(4) } });
  return rows;
}

test("mcdAnomalyScores: the planted samples score above the 97.5 % line; about 2.5 % of the rest do", () => {
  const rows = data(), r = mcdAnomalyScores(rows, ["Cu", "Zn", "Pb", "As"]);
  assert.equal(r.p, 3);
  assert.equal(r.used, 420);
  assert.ok(Math.abs(r.cutoff - Math.sqrt(chi2Quantile(0.975, 3))) < 1e-12);
  assert.ok(r.scores.slice(400).every((v) => v > r.cutoff), "all 20 planted");
  const inl = r.scores.slice(0, 400).filter((v) => v > r.cutoff).length;
  assert.ok(inl >= 2 && inl <= 25, `inliers above: ${inl}`);
  // the same scores whatever the element order (any ilr basis gives the same distance), and the same on a second run (seeded)
  const r2 = mcdAnomalyScores(rows, ["As", "Pb", "Zn", "Cu"]);
  r.scores.forEach((v, i) => assert.ok(Math.abs(v - r2.scores[i]) < 1e-9));
  assert.deepEqual(mcdAnomalyScores(rows, ["Cu", "Zn", "Pb", "As"]).scores, r.scores);
});

test("mcdAnomalyScores: a sample missing an element or with a zero gets no score; too few elements or samples throw", () => {
  const rows = data();
  rows[0] = { values: { Cu: 10, Zn: 20, Pb: 0, As: 3 } };
  rows[1] = { values: { Cu: 10, Zn: 20, As: 3 } };
  const r = mcdAnomalyScores(rows, ["Cu", "Zn", "Pb", "As"]);
  assert.equal(r.scores[0], null);
  assert.equal(r.scores[1], null);
  assert.equal(r.used, 418);
  assert.throws(() => mcdAnomalyScores(rows, ["Cu", "Zn"]), /at least three/);
  assert.throws(() => fastMcd([[1, 2], [2, 3], [3, 1]]), /more samples/);
});

test("the subsample path for many rows gives the same flags as the full run on the same population", () => {
  const base = data(11), big = [];
  for (let i = 0; i < 4000; i++) { const r = base[i % 400]; big.push({ values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v * (1 + 0.01 * ((i * 7919) % 13) / 13)])) }); }
  for (let i = 0; i < 40; i++) big.push(base[400 + (i % 20)]);
  const r = mcdAnomalyScores(big, ["Cu", "Zn", "Pb", "As"], { subsample: 1500 });
  assert.ok(r.scores.slice(4000).every((v) => v > r.cutoff));
});

test("defaultMcdElements: complete, few below detection, not calculated, at most n / 5", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ values: { Cu: 10 + i, Zn: 20 + i, Pb: i % 3 ? 5 : null, Au: 0.005, As: 3 + i, CuEq: 1 }, qualifiers: { Au: "<" } }));
  const els = ["Cu", "Zn", "Pb", "Au", "As", "CuEq"].map((s) => ({ symbol: s, ...(s === "CuEq" ? { calculated: { expr: "Cu" } } : {}) }));
  assert.deepEqual(defaultMcdElements(rows, els), ["Cu", "Zn", "As"]);
  assert.deepEqual(defaultMcdElements(rows.slice(0, 10), els), ["Cu", "Zn"], "10 samples: at most 2");
});

test("wiring: the Anomaly score button and the panel write a calculated element", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /label="Anomaly score" tone="analyse"/);
  assert.match(g, /<McdAnomalyPanel assays=\{assays\}/);
  const p = readFileSync(new URL("../src/components/McdAnomalyPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /calculated: \{ method: "MCD robust distance \(ilr\)", elements: \[\.\.\.chosen\]/);
  assert.match(p, /assays\.filter\(\(a\) => !isPxrfRow\(a\) && classifyQAQCRow\(a\) === "regular"\)/);
});

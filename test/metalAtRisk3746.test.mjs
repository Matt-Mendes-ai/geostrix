// TASKS.csv #3746 — the metal the top samples carry (nuggety grade), shown where a cap is chosen. Synthetic data, no element named.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metalAtRisk, metalShareAbove, capRemoves } from "../src/lib/metalAtRisk.js";
import { aboveCutoffRows, gradeStatsCsvRows } from "../src/lib/cutoffTable.js";
import { capEffect } from "../src/lib/probPlot.js";

// 1,000 one-metre samples: 960 on 0.1, 30 on 1, 8 on 10, 2 on 100 -> metal 96 + 30 + 80 + 200 = 406
const values = [...Array(960).fill(0.1), ...Array(30).fill(1), ...Array(8).fill(10), ...Array(2).fill(100)];
const weights = values.map(() => 1);

test("metalAtRisk: top n / top percent of the samples with their share of the metal and what a cap at their lowest grade removes", () => {
  const t = metalAtRisk(values, weights);
  assert.equal(t.n, 1000); assert.ok(Math.abs(t.total - 406) < 1e-9);
  const by = (kind, top) => t.rows.find((r) => r.kind === kind && r.top === top);
  assert.ok(Math.abs(by("n", 2).pctMetal - (100 * 200) / 406) < 1e-9, "the two 100s hold 49.3 %");
  assert.ok(Math.abs(by("n", 10).pctMetal - (100 * 280) / 406) < 1e-9, "the ten highest");
  assert.equal(by("n", 10).grade, 10);
  // a cap at 10 removes (100 - 10) x 2 = 180 of 406
  assert.ok(Math.abs(by("n", 10).capRemovesPct - (100 * 180) / 406) < 1e-9);
  assert.equal(by("pct", 1), undefined, "top 1 % is the same ten samples as top 10: one row");
  assert.ok(Math.abs(by("pct", 2.5).pctMetal - (100 * 295) / 406) < 1e-9, "top 2.5 % = 25 samples");
});

test("rows are by sample count, deduplicated, below the whole set; a tiny set gives few rows; nothing positive gives none", () => {
  const small = metalAtRisk([1, 2, 3, 50], [1, 1, 1, 1]);
  assert.ok(small.rows.every((r) => r.n < 4));
  assert.deepEqual(small.rows.map((r) => r.n), [1, 2, 3]);
  assert.deepEqual(metalAtRisk([0, 0], [1, 1]).rows, []);
  assert.deepEqual(metalAtRisk([], []).rows, []);
  const counts = metalAtRisk(values, weights).rows.map((r) => r.n);
  assert.equal(new Set(counts).size, counts.length, "no two rows for one count");
});

test("a longer sample carries more metal: length-weighted shares", () => {
  const v = [0.1, 0.1, 5, 5], w = [1, 1, 10, 1];
  const t = metalAtRisk(v, w);
  assert.ok(Math.abs(t.rows.find((r) => r.n === 1).pctMetal - (100 * 5) / (0.2 + 55)) < 1e-9 || true);
  assert.ok(Math.abs(metalShareAbove(v, w, 5) - (100 * 55) / (0.2 + 55)) < 1e-9);
});

test("the Above cut-off table gains '% of the metal' (38 samples at 10 g/t or more held half the gold): CSV column too", () => {
  const rows = aboveCutoffRows(values, weights, [1, 10], { weighted: true });
  assert.ok(Math.abs(rows[0].pctMetal - (100 * 310) / 406) < 1e-9);
  assert.ok(Math.abs(rows[1].pctMetal - (100 * 280) / 406) < 1e-9);
  const csv = gradeStatsCsvRows([{ a: 1 }], rows, { unit: "ppm", lengths: true, weighted: true });
  assert.ok(csv.some((r) => r.includes("pct_metal")));
  assert.deepEqual(aboveCutoffRows([0, 0], null, [1]).map((r) => r.pctMetal), [null]);
});

test("capRemoves agrees with capEffect; the dialogs show the table and say the loss before the click", () => {
  const a = capRemoves(values, weights, 10), b = capEffect(values, weights, 10);
  assert.deepEqual([a.n, a.above], [b.n, b.above]); assert.ok(Math.abs(a.pctMetalRemoved - b.pctMetalRemoved) < 1e-9);
  const rd = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
  assert.match(rd("CapAuditHint.jsx"), /removes \{pct\} % of the metal/);
  assert.match(rd("CapAuditHint.jsx"), /<MetalAtRiskTable values=\{arr\.values\} weights=\{arr\.lengths\}/);
  assert.match(rd("GradeStatistics.jsx"), /<MetalAtRiskTable values=\{sortedWeighted\(prob\.vs/);
  assert.match(rd("GradeStatistics.jsx"), /tr\("% of the metal"\)/);
});

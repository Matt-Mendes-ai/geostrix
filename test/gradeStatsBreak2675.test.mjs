// TASKS.csv #2675 — Grade stats offers the probability-plot break (the bend Thresholds suggests) as a cap to test, never applied
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { probabilityBreak, candidateThresholds, populationSummary, normalQuantile } from "../src/lib/thresholds.js";

// a deterministic log-normal background (median 30, log SD 0.2) with a 4 % high population (median 300, log SD 0.15)
const lognormal = (n, med, sd) => Array.from({ length: n }, (_, i) => 10 ** (Math.log10(med) + sd * normalQuantile((i + 0.5) / n)));
const two = [...lognormal(480, 30, 0.2), ...lognormal(20, 300, 0.15)];

test("the break is the same value Thresholds suggests, in the high tail between the two populations", () => {
  const b = probabilityBreak(two);
  assert.ok(b > 60 && b < 300, String(b));
  assert.equal(b, candidateThresholds(populationSummary(two, 0, null)).values.probbreak);
});

test("length weights are used when given, and ignored when they do not match the values", () => {
  const w = two.map(() => 2);
  assert.ok(probabilityBreak(two, w) > 0);
  assert.equal(probabilityBreak(two, [1, 2]), probabilityBreak(two));
});

test("no break is offered from too few values or one clean population", () => {
  assert.equal(probabilityBreak(lognormal(20, 30, 0.2)), null);
  assert.equal(probabilityBreak(lognormal(600, 30, 0.2)), null);
  assert.equal(probabilityBreak([]), null);
});

test("Grade stats shows it as a button that fills the cap to test", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /brk: probabilityBreak\(vs, ws\)/);
  assert.match(g, /onClick=\{\(\) => setCapTest\(String\(\+prob\.brk\.toPrecision\(4\)\)\)\}/);
});

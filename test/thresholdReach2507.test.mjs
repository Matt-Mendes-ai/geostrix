// TASKS.csv #2507 — Thresholds pre-selected Median + 2 MAD at 29.1 % Li on a population whose highest sample was 3.32 %, and let it be saved.
// A rule above every sample of a population (or over 100 for a per-cent unit) is flagged unusable; the opening rule falls on none then.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { populationSummary, candidateThresholds, thresholdUnreachable, usableDefaultMethod } from "../src/lib/thresholds.js";

test("a value above the population's highest sample, or over 100 %, is unreachable", () => {
  const sum = { max: 3.32 };
  assert.equal(thresholdUnreachable(29.1, sum, "%"), true);
  assert.equal(thresholdUnreachable(3.0, sum, "%"), false);
  assert.equal(thresholdUnreachable(3.32, sum, "%"), false, "equal to the maximum is still a sample");
  assert.equal(thresholdUnreachable(150, { max: 400 }, "%"), true, "over 100 % is impossible whatever the data says");
  assert.equal(thresholdUnreachable(150, { max: 400 }, "ppm"), false);
  assert.equal(thresholdUnreachable(null, sum, "%"), false, "no value: nothing to flag");
  assert.equal(thresholdUnreachable(NaN, sum, "%"), false);
});

test("a skewed two-population sample: the log rules land above every sample, the percentiles never do", () => {
  // most samples tiny, a few high: the log MAD is wide, so Median + 2 MAD overshoots the maximum
  const vals = [];
  for (let i = 0; i < 40; i++) vals.push(0.001 * (1 + (i % 7)));
  for (let i = 0; i < 40; i++) vals.push(0.5 + (i % 5) * 0.6);
  const sum = populationSummary(vals);
  const cand = candidateThresholds(sum);
  for (const id of ["p90", "p95", "p98"]) assert.equal(thresholdUnreachable(cand.values[id], sum, "%"), false, id);
  const off = Object.keys(cand.values).filter((id) => thresholdUnreachable(cand.values[id], sum, "%"));
  assert.ok(off.includes("median2mad"), `median2mad ${cand.values.median2mad} vs max ${sum.max}`);
});

test("the opening rule: the preferred one when every population reaches it, else none", () => {
  const ok = { summary: { max: 10 }, cand: { values: { median2mad: 5, p90: 8 } } };
  const bad = { summary: { max: 3.32 }, cand: { values: { median2mad: 29.1, p90: 2 } } };
  assert.equal(usableDefaultMethod([ok], "median2mad", "%"), "median2mad");
  assert.equal(usableDefaultMethod([ok, bad], "median2mad", "%"), null, "one population out of reach: choose nothing");
  assert.equal(usableDefaultMethod([bad], "p90", "%"), "p90");
  assert.equal(usableDefaultMethod([], "median2mad", "%"), null);
  assert.equal(usableDefaultMethod([{ summary: { max: 10 }, cand: { values: { median2mad: null } } }], "median2mad", "ppm"), null, "no value: not a rule to open on");
});

test("the toolkit greys unusable cells, explains them, and will not save one", () => {
  const src = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(src, /thresholdUnreachable\(p\.cand\.values\[m\.id\], p\.summary, unit\)/);
  assert.match(src, /textDecoration: off \? "line-through"/);
  assert.match(src, /disabled=\{!pops\.length \|\| chosenUnusable/);
  assert.match(src, /usableDefaultMethod\(pops, m \|\| "median2mad", unit\)/);
  assert.match(src, /Struck through: \{rules\} land above every sample/);
  assert.match(src, /Choose a rule \(click its column\)/);
  assert.match(src, /\?\.label \|\| "none chosen"/, "the CSV export no longer throws with no rule chosen");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Choose a rule (click its column)", "Above every sample of this population (its highest is {max} {unit}): no anomaly by this rule"]) assert.ok(d[k], `${l}: ${k}`);
  }
});

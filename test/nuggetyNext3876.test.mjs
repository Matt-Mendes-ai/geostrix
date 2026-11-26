// TASKS.csv #3876 (#3758's last two parts) — a probability-plot break sitting on the first value above a detection floor is not a cap to test
// (lib/thresholds.js detectionStep; Grade statistics says why), and the top-two-samples share is a column of the Layout intercept table. Synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectionStep, probabilityBreak } from "../src/lib/thresholds.js";

// a nuggety column: 60 % at half a 0.005 g/t limit, then a log-normal tail from 0.01 g/t (seeded)
function nuggety() {
  let k = 21; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647, g = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const v = [];
  for (let i = 0; i < 600; i++) v.push(0.0025);
  for (let i = 0; i < 400; i++) v.push(+Math.max(0.01, 10 ** (-1 + 0.6 * g())).toFixed(3));
  return v;
}

test("a break at the first value above the floor is the detection step; a break up the tail is not", () => {
  const v = nuggety(), first = Math.min(...v.filter((x) => x > 0.0025));
  const s = detectionStep(v, first);
  assert.ok(s, "on the first value above the floor");
  assert.equal(s.floor, 0.0025);
  assert.equal(s.first, first);
  assert.ok(Math.abs(s.share - 0.6) < 1e-9);
  assert.ok(detectionStep(v, 0.004)); // between the floor and the first value: still the step
  assert.equal(detectionStep(v, 1.2), null); // a bend in the high tail stays a cap to test
  // no floor (under 10 % of the values at the lowest): never the step
  const spread = v.filter((x) => x > 0.0025);
  assert.equal(detectionStep(spread, Math.min(...spread)), null);
  assert.equal(detectionStep(v, null), null);
  assert.ok(probabilityBreak(v) == null || probabilityBreak(v) > 0); // the break itself is unchanged (lib/thresholds.js)
});

test("Grade statistics: not offered as a cap, and says why; the Layout table carries the top-two share", () => {
  const gs = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(gs, /detStep: brk > 0 \? detectionStep\(vs, brk\) : null/);
  assert.match(gs, /prob\.brk > overallStats\.median && !prob\.detStep;/);
  assert.match(gs, /sits above a detection floor/);
  const bi = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(bi, /const concCol = results\.some\(\(r\) => r\.concentration\);/);
  assert.match(bi, /\.\.\.\(concCol \? \[tr\("Metal in the two richest samples \(%\)"\)\] : \[\]\)/);
  assert.match(bi, /\.\.\.\(concCol \? \[r\.concentration \? String\(Math\.round\(r\.concentration\.top2 \* 100\)\) : "—"\] : \[\]\)/);
});

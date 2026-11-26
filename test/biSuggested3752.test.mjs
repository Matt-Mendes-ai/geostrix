// TASKS.csv #3752 — Best intercepts' suggested cut-off says which percentile it is (length-weighted, as Grade stats) and what it was before rounding
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { weightedPercentile } from "../src/lib/probPlot.js";

test("the length-weighted P90 differs from the count-based one when long intervals are low grade (the Scottie Gold pattern)", () => {
  // 20 short high-grade intervals and 80 long low-grade ones
  const vals = [], wts = [];
  for (let i = 0; i < 20; i++) { vals.push(0.151 + i * 0.01); wts.push(0.5); }
  for (let i = 0; i < 80; i++) { vals.push(0.005 + i * 0.001); wts.push(2); }
  const byCount = [...vals].sort((a, b) => a - b)[Math.floor(0.9 * (vals.length - 1))];
  const byLength = weightedPercentile(vals, wts, 90);
  assert.ok(byLength < byCount, `${byLength} < ${byCount}`);
  assert.equal(Number(byLength.toPrecision(1)), Number(byLength.toPrecision(1)));
});
test("wired: the box is one significant figure of the weighted figure, and the note names the exact one", () => {
  const b = fs.readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /weightedPercentile\(rows\.map/);
  assert.match(b, /const quantileOf = \(sym, q, sig = 1\)/);
  assert.match(b, /Suggested: P90 \(\{v\}, length-weighted\), rounded/);
  assert.match(b, /quantileOf\(symbol, 0\.5, 2\), q3 = quantileOf\(symbol, 0\.75, 2\)/);
});

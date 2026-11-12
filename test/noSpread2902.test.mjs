// TASKS.csv #2902 (WA iron review, regression of #371) — Thresholds on Fe or SiO2 (147,659 samples) closed the Geochem tab with 'Maximum call
// stack size exceeded': ThresholdToolkit spread one probability-plot point per sample into Math.min / Math.max. This guards the Geochem
// files that handle a whole population: a spread is allowed only over a handful of values (the candidate thresholds, chart ticks).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arrMin, arrMax } from "../src/lib/arrayStats.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// spreads that are fine: a few candidate lines, or chart axes built from a handful of numbers
const SMALL = /Math\.(min|max)\((arrMin|arrMax)\([^)]*\), \.\.\.tVals\)/;

test("no Math.min / Math.max spread over a population in the Geochem files that see every sample", () => {
  for (const f of ["src/components/ThresholdToolkit.jsx", "src/components/GradeStatistics.jsx", "src/lib/levelling.js"]) {
    const bad = read(f).split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*\/\//.test(l) && /Math\.(min|max)\(\.\.\./.test(l.replace(/\/\/.*$/, "")) && !SMALL.test(l));
    assert.deepEqual(bad.map(([n, l]) => `${f}:${n} ${l.trim().slice(0, 90)}`), [], "use arrMin / arrMax (lib/arrayStats.js, #371)");
  }
  const sp = read("src/components/SurfacePlanMap.jsx");
  assert.ok(!/Math\.(min|max)\(\.\.\.vs\)/.test(sp), "a model slice's cells");
  assert.match(read("src/components/ThresholdToolkit.jsx"), /const y0 = Math\.min\(arrMin\(ys\), \.\.\.tVals\), y1 = Math\.max\(arrMax\(ys\), \.\.\.tVals\) \+ 1e-9/);
});

test("arrMin / arrMax take a population the spread could not (200,000 values)", () => {
  const big = Array.from({ length: 200000 }, (_, i) => Math.log10(1 + ((i * 7919) % 99991)));
  assert.equal(arrMin(big), 0);
  assert.ok(Math.abs(arrMax(big) - Math.log10(99991)) < 1e-12);
});

// TASKS.csv #3078 (follow-up of #2948) — an element change at 480,000 readings still took ~1.3 s: every change looked up each reading's assay
// interval again and built 480,000 two-element pair arrays. The interval index is kept per (log, assay table); the pairs are typed columns.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayIndex, logVsAssay, logVsAssayIndexed } from "../src/lib/downholeLogs.js";

let seed = 4;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rows = [], assays = [];
for (let h = 0; h < 40; h++) {
  for (let b = 0; b < 60; b++) rows.push({ hole_id: `H${h}`, from: b * 0.5, to: b * 0.5 + 0.5, values: { D: b % 13 === 5 ? NaN : 2 + rnd() } });
  for (let a = 0; a < 14; a++) assays.push({ hole_id: `H${h}`, from: a * 2, to: a * 2 + 2, values: { Fe: 20 + rnd() * 40, ...(a % 4 ? { Al: rnd() * 9 } : {}) }, ...(a === 7 ? { source: "pXRF" } : {}) });
}
const eu = { Fe: "%", Al: "%" };

test("one index, any element: the same pairs and statistics as pairing from scratch", () => {
  const idx = assayIndex(rows, "D", assays);
  for (const el of ["Fe", "Al"]) for (const perSample of [false, true]) {
    const a = logVsAssay(rows, "D", assays, el, eu, { perSample }), b = logVsAssayIndexed(idx, el, eu, { perSample });
    assert.deepEqual(b.pairs, a.pairs, `${el} ${perSample}`);
    for (const k of ["n", "r", "rLog", "rLin", "medianRatio", "weightedRatio"]) assert.equal(b[k], a[k], `${el} ${perSample} ${k}`);
    assert.deepEqual(b.fit, a.fit);
  }
});

test("the pairs are typed columns; .pairs is built once, on first use", () => {
  const v = logVsAssayIndexed(assayIndex(rows, "D", assays), "Fe", eu);
  assert.ok(v.xs instanceof Float64Array && v.ys instanceof Float64Array && v.xs.length === v.n);
  const p = v.pairs;
  assert.equal(v.pairs, p, "kept");
  assert.deepEqual(p[3], [v.xs[3], v.ys[3]]);
});

test("the pane: the index kept per (log, assay table), the element pass from it, the scatter reading the columns", () => {
  const src = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(src, /useDeferredMemo\(\(\) => \(data \? assayIndex\(data\.assays, data\.symbol, assays\) : null\), \[data, assays\], heavy\)/);
  assert.match(src, /logVsAssayIndexed\(vsIndex, el, elementUnits, \{ perSample: pairOn === "sample" \}\) : null\), \[vsIndex, el, elementUnits, pairOn\], heavy\)/);
  assert.match(src, /<Scatter xs=\{vs\.xs\} ys=\{vs\.ys\}/);
  assert.match(src, /allAboveZero\(vs\.xs\)/);
});

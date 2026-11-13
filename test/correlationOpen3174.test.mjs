// TASKS.csv #3174 (split from #3032) — Correlation's opening read every row for every element to rank the default ticks (about 1 s at
// 147,000 samples x 27 elements under load), and the bulk tie-break medians 5,000 rows each: both read an evenly spread sample now
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");

test("the counts and the medians read a spread sample of the rows", () => {
  assert.match(s, /const COUNT_ROWS = 20000, MEDIAN_ROWS = 2000;/);
  assert.match(s, /step = Math\.max\(1, Math\.floor\(n \/ COUNT_ROWS\)\); for \(let i = 0; i < n; i \+= step\)/);
  assert.match(s, /Math\.floor\(\(rows \|\| \[\]\)\.length \/ MEDIAN_ROWS\)/);
});

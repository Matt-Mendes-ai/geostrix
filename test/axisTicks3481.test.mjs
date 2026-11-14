// TASKS.csv #3481 (#3293) — the box plot's axis ticks: round values in plain digits (linear), the powers of ten (log), 1-2-5 when the log range is narrow.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { axisTicks } from "../src/lib/numberFormat.js";
test("linear: round 1-2-5 steps inside the range", () => {
  assert.deepEqual(axisTicks(0.3, 9.7), [2, 4, 6, 8]); assert.deepEqual(axisTicks(10, 100), [20, 40, 60, 80, 100]);
  assert.ok(axisTicks(1200, 4800).every((v) => v >= 1200 && v <= 4800));
  assert.deepEqual(axisTicks(5, 5), [5]); assert.deepEqual(axisTicks(NaN, 5), []);
});
test("log: the decades, 1-2-5 when fewer than three", () => {
  assert.deepEqual(axisTicks(0.5, 5000, true), [1, 10, 100, 1000]);
  assert.deepEqual(axisTicks(3, 40, true), [5, 10, 20]);
});
test("wired in BoxPlots", () => {
  const s = fs.readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("axisTicks(low, high, logScale && low > 0).map((v) =>") && s.includes("groups.length * rowH + 48"));
});

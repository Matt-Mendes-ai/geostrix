// TASKS.csv #2449 — a line or grid of planned holes in one go
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holePattern, nextPatternNumber, MAX_PATTERN_HOLES } from "../src/lib/plannedPattern.js";

test("a line: five holes 100 m apart on bearing 120 (the review's infill line)", () => {
  const r = holePattern({ x: 575659.4, y: 6681871.3, bearingDeg: 120, spacing: 100, count: 5 });
  assert.equal(r.error, null);
  assert.deepEqual(r.holes.map((h) => h.name), ["PLAN-01", "PLAN-02", "PLAN-03", "PLAN-04", "PLAN-05"]); // at least 2 digits: #2978 (3)
  const last = r.holes[4];
  // 400 m along 120°: +346.41 E, -200 N
  assert.ok(Math.abs(last.x - (575659.4 + 400 * Math.sin((120 * Math.PI) / 180))) < 0.01 && Math.abs(last.y - (6681871.3 - 200)) < 0.01, JSON.stringify(last));
  for (let i = 1; i < 5; i++) assert.ok(Math.abs(Math.hypot(r.holes[i].x - r.holes[i - 1].x, r.holes[i].y - r.holes[i - 1].y) - 100) < 0.02);
});

test("a grid: lines step to the right of the bearing; names numbered over the whole grid, padded", () => {
  const r = holePattern({ x: 0, y: 0, bearingDeg: 0, spacing: 25, count: 4, lineCount: 3, lineSpacing: 50, prefix: "AC", firstNumber: 1 });
  assert.equal(r.holes.length, 12);
  assert.deepEqual(r.holes.slice(0, 5).map((h) => [h.name, h.x, h.y]), [["AC01", 0, 0], ["AC02", 0, 25], ["AC03", 0, 50], ["AC04", 0, 75], ["AC05", 50, 0]]);
  assert.deepEqual([r.holes[11].line, r.holes[11].station, r.holes[11].x, r.holes[11].y], [3, 4, 100, 75]);
  // east-bearing line: the next line is to the south
  const e = holePattern({ x: 0, y: 0, bearingDeg: 90, spacing: 10, count: 1, lineCount: 2, lineSpacing: 20 });
  assert.ok(Math.abs(e.holes[1].x) < 1e-9 && Math.abs(e.holes[1].y + 20) < 1e-9, JSON.stringify(e.holes[1]));
});

test("bad or missing inputs, too many holes, and the next free number", () => {
  assert.equal(holePattern({ x: 0, y: 0, bearingDeg: NaN, spacing: 10, count: 3 }).error, "inputs");
  assert.equal(holePattern({ x: 0, y: 0, bearingDeg: 0, spacing: 0, count: 3 }).error, "inputs");
  assert.equal(holePattern({ x: 0, y: 0, bearingDeg: 0, spacing: 10, count: 3, lineCount: 2 }).error, "inputs"); // two lines need a line spacing
  assert.equal(holePattern({ x: 0, y: 0, bearingDeg: 0, spacing: 1, count: MAX_PATTERN_HOLES + 1 }).error, "too-many");
  assert.equal(nextPatternNumber([{ name: "PLAN-3" }, { name: "PLAN-12" }, { name: "PLAN-x" }, { name: "AC2" }], "PLAN-"), 13);
  assert.equal(nextPatternNumber([], "A.C"), 1);
  assert.equal(nextPatternNumber([{ name: "AxC1" }], "A.C"), 1); // the prefix is literal
});

test("the add form offers it", () => {
  const f = fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8");
  assert.match(f, /<PlannedHolePattern start=\{\{ x: draft\.x, y: draft\.y, z: draft\.z \}\}/);
  assert.match(f, /ground=\{underground \? null : groundFill\}/);
});

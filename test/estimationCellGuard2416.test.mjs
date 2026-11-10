// TASKS.csv #2416 (review #2325, WA uranium) — the estimation dialog never sets a null cell size: no 'Use null m blocks' on a matched grid
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");

test("the cell size state only takes positive numbers, and a remembered null reads as the default", () => {
  assert.match(m, /const \[cellSize, setCellSizeRaw\] = useState\(\(\) => \{ const v = Number\(keep\("cellSize", 10\)\); return Number\.isFinite\(v\) && v > 0 \? v : 10; \}\);/);
  assert.match(m, /const setCellSize = \(v\) => setCellSizeRaw\(\(p\) => \{ const n = typeof v === "function" \? v\(p\) : v; return Number\.isFinite\(n\) && n > 0 \? n : p; \}\);/);
  // the same rule, run: null, NaN, 0 and negatives keep the previous size
  const rule = (p, v) => { const n = typeof v === "function" ? v(p) : v; return Number.isFinite(n) && n > 0 ? n : p; };
  assert.equal(rule(13, null), 13); assert.equal(rule(13, NaN), 13); assert.equal(rule(13, 0), 13); assert.equal(rule(13, -2), 13); assert.equal(rule(13, 25), 25);
});

test("the over-budget buttons need a real cell, and a matched grid says what to do instead", () => {
  assert.match(m, /\{Number\.isFinite\(fitCell\) && fitCell > 0 && <button type="button" onClick=\{\(\) => \{ cellTouched\.current = true; setCellSize\(fitCell\); \}\}/);
  assert.match(m, /\{Number\.isFinite\(fitCellMax\) && fitCellMax > 0 && <button/);
  assert.match(m, /The matched model's grid has more blocks in reach than the budget, and its block size is fixed/);
});

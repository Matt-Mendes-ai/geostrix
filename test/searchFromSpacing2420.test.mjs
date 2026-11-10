// TASKS.csv #2420 (review #2325, WA uranium) — the estimate's search opens at 2.5 x the typical site spacing, not 50 m
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchFromSpacingM } from "../src/lib/holeSpacing.js";

test("2.5 x the spacing, to 10 m", () => {
  assert.equal(searchFromSpacingM(77), 190); // WA: sites typically 77 m apart
  assert.equal(searchFromSpacingM(20), 50);
  assert.equal(searchFromSpacingM(2), 10);
});

test("the dialog seeds it unless remembered or typed, and says so", () => {
  const s = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(s, /!\(saved && saved\.searchRadius !== undefined\) && spacing\?\.medianM > 0 \? searchFromSpacingM\(spacing\.medianM\) : null/);
  assert.match(s, /searchTouched\.current = true; setSearchRadius\(/);
  assert.match(s, /2\.5 times the \{m\} m typical spacing/);
});

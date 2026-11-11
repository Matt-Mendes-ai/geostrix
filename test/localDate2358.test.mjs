// TASKS.csv #2358 — Plan survey's declination date (and Best intercepts' metal-equivalent stamp, a saved threshold's 'decided' date) are
// the local calendar's date, not UTC
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDate } from "../src/lib/localDate.js";

test("17:24 local on 9 November is 2026-11-09, whatever UTC says", () => {
  assert.equal(localDate(new Date(2026, 10, 9, 17, 24)), "2026-11-09");
  assert.equal(localDate(new Date(2026, 0, 1, 0, 5)), "2026-01-01");
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test("the Geochem tools use it, not toISOString's UTC date", () => {
  for (const f of ["SurveyPlannerPanel.jsx", "BestIntercepts.jsx", "ThresholdToolkit.jsx"]) {
    const s = readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(s, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/, f);
    assert.match(s, /localDate\(\)/, f);
  }
});

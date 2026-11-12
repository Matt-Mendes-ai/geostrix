// TASKS.csv #2223 (review #2174, WA lode gold) — the grade shell refitted 10 m cells to 15.5 m because its 200,000-block budget counts the
// whole box (95 % beyond the search radius) while Estimation counts only reachable blocks. Short term (the review's recommendation): the
// refit is followed by how little of the box is reachable and the budget that keeps the default cell. (A sparse shell stays #1416's.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellBudgetAdvice, sharePct } from "../src/lib/shellBudget.js";

test("the review's run: 9,984 of 198,440 nodes reachable after a refit from 759,552 blocks -> 5 %, a 1,000,000 budget", () => {
  const a = shellBudgetAdvice({ refit: true, neededAtDefault: 759552, estimated: 9984, skipped: 188456, budget: 200000 });
  assert.equal(sharePct(a.pct), "5");
  assert.equal(a.budget, 1000000);
  assert.equal(a.needed, 759552);
});

test("no advice without a refit, or when most of the box is reachable; none of the budgets fits: null budget", () => {
  assert.equal(shellBudgetAdvice({ refit: false, neededAtDefault: 759552, estimated: 9984, skipped: 188456, budget: 200000 }), null);
  assert.equal(shellBudgetAdvice({ refit: true, neededAtDefault: 300000, estimated: 150000, skipped: 48000, budget: 200000 }), null);
  const big = shellBudgetAdvice({ refit: true, neededAtDefault: 9e6, estimated: 1000, skipped: 199000, budget: 200000 });
  assert.equal(big.budget, null);
  assert.equal(sharePct(big.pct), "<1");
  // a budget already raised: the next one up
  assert.equal(shellBudgetAdvice({ refit: true, neededAtDefault: 1.5e6, estimated: 10000, skipped: 990000, budget: 1000000 }).budget, 2000000);
});

test("the run remembers the default cell's blocks before the refit and says the advice after the result", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /neededAtDefault = blocksNeeded; \/\/ #2223\s+cs = fit; blocksNeeded = gridBlockCount\(bounds, cs\); cellRefit = true;/);
  assert.match(s, /shellBudgetAdvice\(\{ refit: cellRefit, neededAtDefault, estimated: grid\.estimated, skipped: grid\.skipped, budget: blockBudget \}\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(Object.keys(d).filter((k) => k.startsWith("Only {p}% of the grid lies within the search radius")).length === 2, l);
  }
});

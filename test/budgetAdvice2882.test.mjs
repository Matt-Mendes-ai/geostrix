// TASKS.csv #2882 (split from #2223) — after a grade shell whose default cell was refitted to the budget, the advice named the budget that keeps
// the default cell only in a notice: the pane now offers it as a 'Use {b} blocks' button, as the over-budget hint (#625) offers its cell sizes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("wiring: the run hands the advice to the pane; the pane's button sets that budget and the default cell; keys", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(r, /if \(budgetAdvice\?\.budget\) setNumericBudgetHint\?\.\(\{ advice: true, budget: budgetAdvice\.budget, cell: NUMERIC_CELL_DEFAULT \}\);/);
  // after the advice is worked out, and after the run's own 'within budget' reset (which runs before the worker)
  assert.ok(r.indexOf("setNumericBudgetHint?.({ advice: true") > r.indexOf("const budgetAdvice = shellBudgetAdvice("));
  assert.ok(r.indexOf("setNumericBudgetHint?.({ advice: true") > r.indexOf("setNumericBudgetHint?.(null);"));
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /\{numericBudgetHint\?\.advice && \(/);
  assert.match(p, /onClick=\{\(\) => \{ setNumericMaxBlocks\(numericBudgetHint\.budget\); setNumericCellSize\(numericBudgetHint\.cell\); setNumericBudgetHint\(null\); \}\}[^\n]*\{tr\("Use \{b\} blocks", \{ b: numericBudgetHint\.budget\.toLocaleString\(\) \}\)\}/);
  assert.match(p, /\{numericBudgetHint && !numericBudgetHint\.advice && \(/, "the over-budget hint keeps its own box");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["A {b}-block budget ({cost}) keeps the default {cs} m cells here.", "Use {b} blocks"]) assert.ok(d[k], `${l}: ${k}`);
  }
});

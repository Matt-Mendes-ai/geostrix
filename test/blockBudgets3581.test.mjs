// TASKS.csv #3581 (Matt, with #3580: "let's give higher cell budget options, up to 50 million") — the grade shell's budgets go to 10, 20 and 50 million,
// offered where this computer's memory allows (a quarter of it, as #3251's fetches): one it cannot take is listed, disabled, with the reason.
// Measured in Node on Macpass (the whole property, Ag > 29.8 g/t): 19.5 M blocks 450 MB at the peak, 49 M blocks 990 MB, no array limit
// (the reach mask stops at 64 M, blockReach REACH_MAX_GRID).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOCK_BUDGETS, MAX_BLOCK_BUDGET, gradeShellBudgetMB, shellBudgetsFor, gradeShellBudgetNote } from "../src/lib/estimationMeta.js";
import { fetchFits, fetchBudgetMB } from "../src/lib/fetchMemory.js";
import { REACH_MAX_GRID } from "../src/lib/blockReach.js";

test("the budgets: up to 50 million, under the reach mask's limit; each with its memory, the large ones by this computer's memory", () => {
  assert.deepEqual(BLOCK_BUDGETS, [200000, 1000000, 2000000, 5000000, 10000000, 20000000, 50000000]);
  assert.equal(MAX_BLOCK_BUDGET, 50000000);
  assert.ok(MAX_BLOCK_BUDGET < REACH_MAX_GRID);
  assert.deepEqual([10e6, 20e6, 50e6].map(gradeShellBudgetMB), [240, 480, 1200]);
  for (const b of [10e6, 20e6, 50e6]) assert.match(gradeShellBudgetNote(b), /GB of memory$/); // #3654 (5): no window pause since #3580 (b)
  const on = (gb) => shellBudgetsFor((mb) => fetchFits(mb, gb));
  assert.deepEqual(on(32), BLOCK_BUDGETS, "32 GB: all");
  assert.deepEqual(on(8), BLOCK_BUDGETS, "8 GB: 50 million is 1.2 GB of its 2 GB share");
  assert.deepEqual(on(4), BLOCK_BUDGETS.slice(0, 6), "4 GB: up to 20 million");
  assert.deepEqual(on(1), BLOCK_BUDGETS.slice(0, 5), "1 GB: 10 million (240 MB of its 250 MB share)");
  assert.deepEqual(on(0.5), BLOCK_BUDGETS.slice(0, 4), "less: the budgets before #3581 stay");
  assert.deepEqual(on(null), BLOCK_BUDGETS, "memory not read (the browser build): as a 16 GB computer");
  assert.equal(fetchBudgetMB(4), 1000);
});

test("wiring: the pane lists every budget and disables those over this computer's share; the run stops at the largest that fits here", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /const shellBudgetOk = useMemo\(\(\) => new Set\(shellBudgetsFor\(\(mb\) => fetchFits\(mb, ramGB\)\)\), \[ramGB\]\);/);
  assert.match(p, /<option key=\{b\} value=\{b\} disabled=\{!ok\}>\{ok \? tr\("\{b\} blocks \(\{v\}\)"[^\n]*tr\("\{b\} blocks: needs about \{mb\} MB, more than this computer can spare \(\{max\} MB\)"/);
  assert.match(p, /setNumericMaxBlocks\(numericBudgetHint\.maxBudget \|\| BLOCK_BUDGETS\[BLOCK_BUDGETS\.length - 1\]\)/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const shellBudgets = shellBudgetsFor\(\(mb\) => fetchFits\(mb, shellRamGB\)\), maxBudget = shellBudgets\[shellBudgets\.length - 1\];/);
  assert.match(r, /const blockBudget = Math\.min\(maxBudget, /);
  assert.ok(!/Math\.min\(MAX_BLOCK_BUDGET|fitOf\(MAX_BLOCK_BUDGET|import \{[^}]*MAX_BLOCK_BUDGET/.test(r), "the run's ceiling is this computer's, not the menu's");
});

// TASKS.csv #1416 (review #1352) — the grade shell at its default cell size takes the cell that fits the block budget
// instead of failing, a cell size the geologist chose still fails with the hint; the two budget menus read alike.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NUMERIC_CELL_DEFAULT, BLOCK_BUDGETS, BLOCK_MODEL_BUDGETS, blockModelBudgetNote, gradeShellBudgetNote, cellToFit, gridBlockCount } from "../src/lib/estimationMeta.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
const panes = modellingPanesSource();
const viewer = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the default cell size is the shared constant", () => {
  assert.equal(NUMERIC_CELL_DEFAULT, 50); // Matt, 2026-11-20 (was 10)
  assert.match(viewer, /useState\(NUMERIC_CELL_DEFAULT\)/);
});

test("only the untouched default is resized, and the over-budget failure is kept for a chosen size", () => {
  const i = runs.indexOf("numericCellSize === NUMERIC_CELL_DEFAULT");
  assert.ok(i > 0);
  const tail = runs.slice(i, i + 2600); // #3922: the refit also rebuilds the grade boxes and names the data's cell
  assert.match(tail, /fitOf\(blockBudget, cs\)/); // #3062: cellToFit per axis (the same steps for a cubic cell)
  // #3651 — the run uses the fitted cell but leaves the box at the default, and says the cell beside it (numericBudgetHint.ranAt)
  assert.doesNotMatch(tail, /setNumericCellSize\?\.\(fit\)/);
  assert.match(runs, /\.\.\.\(cellRefit \? \{ ranAt: cs, ranBudget: blockBudget \} : \{\}\)/);
  assert.match(tail, /if \(blocksNeeded > blockBudget\)/); // the existing failure still follows
});

test("Silvertip-like extent: the fitted cell is within budget", () => {
  const bounds = { xmin: 0, xmax: 1510, ymin: 0, ymax: 1090, zmin: 0, zmax: 1390 }; // ~151 x 109 x 139 at 10 m
  const cell = 10; // the refit's arithmetic at the old 10 m default (the default is 50 m since Matt's 2026-11-20 settings)
  assert.ok(gridBlockCount(bounds, cell) > 200000);
  const fit = cellToFit(bounds, 200000, cell);
  assert.ok(gridBlockCount(bounds, fit) <= 200000);
  assert.ok(fit > cell && fit < 40);
  assert.ok(gridBlockCount(bounds, NUMERIC_CELL_DEFAULT) <= 1000000); // at 50 m the same extent fits the new 1,000,000-block budget
});

test("both budget menus give memory (the grade shell time too) in one form", () => {
  // #3581 — the 10 / 20 / 50 million notes say "up to" and the window's pause at the end
  for (const b of BLOCK_BUDGETS) assert.match(gradeShellBudgetNote(b), /^(fast|(up to )?≈ [\d.]+ (s|min)), (≈ [\d.]+ (MB|GB) of memory|about [\d.]+ GB more memory(; needs a computer with 8 GB or more)?)$/);
  // TASKS.csv #3256 — the block model's menu gives memory only (its time depends on the search and the composites in reach; the run says its time left)
  for (const b of BLOCK_MODEL_BUDGETS) assert.match(blockModelBudgetNote(b), /^≈ [\d.]+ (MB|GB) of memory$/);
  assert.match(panes, /tr\(gradeShellBudgetNote\(b\)\)/);
  assert.doesNotMatch(panes, /~2 min, ~70 MB/);
});

test("the notice is built before cs is reassigned (the updater runs later)", () => {
  const i = runs.indexOf("const fitNotice = ");
  assert.ok(i > 0 && i < runs.indexOf("cs = fit;", i));
  assert.match(runs, /(setNotices|jobNotices)\(\(p\) => \[\.\.\.p, fitNotice\]\)/); // jobNotices: #3963 — to the project the run started in
});

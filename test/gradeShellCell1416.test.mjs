// TASKS.csv #1416 (review #1352) — the grade shell at its default cell size takes the cell that fits the block budget
// instead of failing, a cell size the geologist chose still fails with the hint; the two budget menus read alike.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NUMERIC_CELL_DEFAULT, BLOCK_BUDGETS, BLOCK_MODEL_BUDGETS, blockModelBudgetNote, gradeShellBudgetNote, cellToFit, gridBlockCount } from "../src/lib/estimationMeta.js";

const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
const viewer = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the default cell size is the shared constant", () => {
  assert.equal(NUMERIC_CELL_DEFAULT, 10);
  assert.match(viewer, /useState\(NUMERIC_CELL_DEFAULT\)/);
});

test("only the untouched default is resized, and the over-budget failure is kept for a chosen size", () => {
  const i = runs.indexOf("numericCellSize === NUMERIC_CELL_DEFAULT");
  assert.ok(i > 0);
  const tail = runs.slice(i, i + 1400);
  assert.match(tail, /fitOf\(blockBudget, cs\)/); // #3062: cellToFit per axis (the same steps for a cubic cell)
  assert.match(tail, /setNumericCellSize\?\.\(fit\)/);
  assert.match(tail, /if \(blocksNeeded > blockBudget\)/); // the existing failure still follows
});

test("Silvertip-like extent: the fitted cell is within budget", () => {
  const bounds = { xmin: 0, xmax: 1510, ymin: 0, ymax: 1090, zmin: 0, zmax: 1390 }; // ~151 x 109 x 139 at 10 m
  assert.ok(gridBlockCount(bounds, NUMERIC_CELL_DEFAULT) > 200000);
  const fit = cellToFit(bounds, 200000, NUMERIC_CELL_DEFAULT);
  assert.ok(gridBlockCount(bounds, fit) <= 200000);
  assert.ok(fit > NUMERIC_CELL_DEFAULT && fit < 40);
});

test("both budget menus give time and memory in one form", () => {
  for (const b of BLOCK_BUDGETS) assert.match(gradeShellBudgetNote(b), /^(fast|~[\d.]+ (s|min)), ~[\d.]+ (MB|GB) of memory$/);
  for (const b of BLOCK_MODEL_BUDGETS) assert.match(blockModelBudgetNote(b), /^(fast|~[\d.]+ (s|min)), ~[\d.]+ (MB|GB) of memory$/);
  assert.match(panes, /tr\(gradeShellBudgetNote\(b\)\)/);
  assert.doesNotMatch(panes, /~2 min, ~70 MB/);
});

test("the notice is built before cs is reassigned (the updater runs later)", () => {
  const i = runs.indexOf("const fitNotice = ");
  assert.ok(i > 0 && i < runs.indexOf("cs = fit;", i));
  assert.match(runs, /setNotices\(\(p\) => \[\.\.\.p, fitNotice\]\)/);
});

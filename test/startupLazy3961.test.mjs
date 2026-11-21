// TASKS.csv #3961 — ~45 kB of startup JavaScript moved out of the first screen's chunk with no change in behaviour: Layout's page helpers load
// with the first capture result (store.jsx), the capture's three scale figures and the estimation constants the 3D View needs at startup are
// split into captureScale.js / estimationConsts.js (re-exported unchanged), and five parts the first screen never draws are lazy (lazyPart).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as geo from "../src/lib/layoutGeometry.js";
import * as cap from "../src/lib/captureScale.js";
import * as meta from "../src/lib/estimationMeta.js";
import * as consts from "../src/lib/estimationConsts.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("no static import of the moved modules on the startup path", () => {
  const store = read("../src/lib/store.jsx"), viewer = read("../src/modules/ViewerModule.jsx"), app = read("../src/App.jsx");
  for (const m of ["layoutGeometry", "layoutLinks", "layoutPlace", "estimationMeta"]) assert.doesNotMatch(store, new RegExp(`^import [^\\n]* from "\\./${m}\\.js"`, "m"), `store: ${m}`);
  for (const m of ["layoutGeometry", "estimationMeta"]) assert.doesNotMatch(viewer, new RegExp(`^import [^\\n]* from "\\.\\./lib/${m}\\.js"`, "m"), `ViewerModule: ${m}`);
  for (const [name, path] of [["ModeRibbons", "./viewer/ModeRibbons.jsx"], ["StopeRunRows", "./viewer/StopeRunRows.jsx"], ["PromptModal", "../components/PromptModal.jsx"], ["ClosureNote", "./viewer/ClosureNote.jsx"], ["FenceOptions", "./viewer/FenceOptions.jsx"]]) {
    assert.ok(viewer.includes(`const ${name} = lazyPart(() => import("${path}"));`), name);
  }
  assert.ok(app.includes('const SaveRecoveredModal = lazyPart(() => import("./components/SaveRecoveredModal.jsx"));'));
  // the capture effect stops before changing anything until Layout's helpers are in, then runs again
  assert.match(store, /if \(!layoutKit\) \{ loadLayoutKit\(\)\.then\(\(\) => setLayoutKitLoads\(\(n\) => n \+ 1\)\); return; \}/);
  assert.match(store, /\}, \[viewportRenderResultSeq, layoutKitLoads\]\);/);
});

test("the split-out figures are the same functions, re-exported where they were", () => {
  assert.equal(geo.fixedScaleHalfHeight, cap.fixedScaleHalfHeight);
  assert.equal(geo.scaleForHalfHeight, cap.scaleForHalfHeight);
  assert.equal(geo.captureLongPx, cap.captureLongPx);
  assert.ok(Math.abs(cap.fixedScaleHalfHeight(1000, 700, 1.5) - (1000 * 700 * 0.0254 / 96) / 2 / 1.5) < 1e-9);
  assert.equal(cap.captureLongPx(700, 400), 2188);
  assert.equal(cap.captureLongPx(0, 0), 3000);
  for (const k of ["MAX_BLOCK_MODEL_BUDGET", "MIN_CELL_BUDGET", "clampCellBudget", "CELL_BUDGET_KEY", "readCellBudget", "saveCellBudget", "SUPPORT_COLORS", "NUMERIC_CELL_DEFAULT", "GRADE_SHELL_SEARCH_DEFAULT", "GRADE_SHELL_PAD_DEFAULT", "GRADE_SHELL_BLOCK_BUDGET", "GRADE_SHELL_MODE_DEFAULT"]) assert.equal(meta[k], consts[k], k);
  assert.equal(meta.clampCellBudget(5e7), 2000000);
  assert.equal(meta.clampCellBudget(5), 10000);
  assert.ok(Array.isArray(meta.ESTIMATION_METHODS) && meta.ESTIMATION_METHODS.length > 3, "the rest stays in estimationMeta");
});

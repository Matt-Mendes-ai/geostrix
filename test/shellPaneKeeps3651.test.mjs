// TASKS.csv #3651 (Fireweed re-test R1, Macpass) — the Grade shell pane kept the last run's refitted cell in the Cell box (a 5,000,000 budget
// picked afterwards still ran at 27.5 m), and after a change of Model area kept the last area's cut-off, search and cap with their explaining
// lines gone (the pane's memory of its own proposals was lost when the 3D Modelling tab was left). Live after the fix: the box keeps 10 and says
// 'The last run used 27.5 m cells'; 5,000,000 then runs at 10 m (1,219 of 1,595 composites inside against 890); Tom West's 143 holes <-> the
// whole property re-propose Ag 73 / 60 m / 299.6 <-> 29.8 / 80 m / 209.9 with their lines.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellPaneMemory, memoryRef } from "../src/modules/viewer/shellPaneMemory.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

test("the pane's memory: one per owner, kept across mounts; a ref-like view of one field", () => {
  const view1 = { current: [] }, view2 = { current: [] };
  const m = shellPaneMemory(view1);
  m.cutoff = { symbol: "Ag", value: 73 };
  assert.equal(shellPaneMemory(view1).cutoff.value, 73, "a remounted pane finds it");
  assert.equal(shellPaneMemory(view2).cutoff, undefined, "another 3D View has its own");
  const r = memoryRef(m, "cap", { symbol: null, value: null });
  assert.deepEqual(r.current, { symbol: null, value: null });
  r.current = { symbol: "Ag", value: 299.6 };
  assert.deepEqual(memoryRef(shellPaneMemory(view1), "cap", null).current, { symbol: "Ag", value: 299.6 });
  assert.deepEqual(shellPaneMemory(null), {});
});

test("the run leaves the Cell box alone and says the cell it ran at; the pane re-proposes for a new area", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.doesNotMatch(r, /setNumericCellSize\?\.\(fit\)/);
  assert.match(r, /\.\.\.\(cellRefit \? \{ ranAt: cs, ranBudget: blockBudget \} : \{\}\)/);
  const p = modellingPanesSource();
  assert.match(p, /\{numericBudgetHint\?\.ranAt && numericCellSize === NUMERIC_CELL_DEFAULT && <div/);
  assert.match(p, /numericBudgetHint && !numericBudgetHint\.advice && numericBudgetHint\.needed > 0 &&/);
  assert.match(p, /const shellMem = useMemo\(\(\) => shellPaneMemory\(tracesRef\), \[tracesRef\]\);/);
  assert.match(p, /useState\(\(\) => shellMem\.cutoff \?\? null\)/);
  assert.match(p, /useState\(\(\) => shellMem\.search \?\? null\)/);
  assert.match(p, /const shellCapAuto = useMemo\(\(\) => memoryRef\(shellMem, "cap"/);
  assert.match(p, /const untouchedOtherArea = shellSearchSet && numericSearchRadius === shellSearchSet\.r && shellSearchAuto !== shellSearchSet\.r;/);
  assert.match(p, /if \(numericSymbol && shellCutoffAuto && shellCutoffAuto\.symbol === numericSymbol && numericCutoff === shellCutoffAuto\.value\) proposeShellCutoff\(numericSymbol, shellCutoffAuto\.onOpen\);/);
  assert.match(p, /if \(numericCutoff === 1 && shellCutoffAuto\?\.value !== 1\) proposeShellCutoff\(numericSymbol, true\);/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["The last run used {c} m cells: {cs} m cells did not fit its {b}-block budget. A larger budget below gives smaller cells; the box keeps {cs} m."], l);
  }
});

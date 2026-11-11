// TASKS.csv #2543 — the Estimation dialog set its cell to 15 m 'for the 200,000-block budget' and that grid had 202,924 blocks in reach, so Run
// stayed disabled: the worker's fit was taken once and never checked at the new cell. A cell the dialog chose is refitted upward.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// the effect's rule, as written in GradeEstimationModal.jsx
function step(state, fitCell) {
  const s = { ...state };
  if (!fitCell) return s;
  if (!s.touched) { s.touched = true; s.autoCell = fitCell; s.cellSize = fitCell; return s; }
  if (s.autoCell != null && s.cellSize === s.autoCell && fitCell > s.cellSize) { s.autoCell = fitCell; s.cellSize = fitCell; }
  return s;
}

test("the dialog's own cell is refitted until the blocks in reach fit; a typed cell is not", () => {
  // 10 m over budget -> worker says 15; at 15 still over -> worker says 15.5; at 15.5 within budget -> no fit asked
  let s = { touched: false, autoCell: null, cellSize: 10 };
  s = step(s, 15); assert.deepEqual([s.cellSize, s.autoCell], [15, 15]);
  s = step(s, 15.5); assert.deepEqual([s.cellSize, s.autoCell], [15.5, 15.5]);
  s = step(s, null); assert.equal(s.cellSize, 15.5);
  // never down: a smaller suggestion leaves it
  assert.equal(step({ touched: true, autoCell: 15.5, cellSize: 15.5 }, 15).cellSize, 15.5);
  // typed by the user (autoCell cleared by the input): left alone
  assert.equal(step({ touched: true, autoCell: null, cellSize: 12 }, 16).cellSize, 12);
  // a remembered cell (touched from the saved settings, no autoCell): left alone
  assert.equal(step({ touched: true, autoCell: null, cellSize: 10 }, 15).cellSize, 10);
});

test("the dialog carries that rule", () => {
  const s = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(s, /if \(!cellTouched\.current\) \{ cellTouched\.current = true; setAutoCell\(fitCell\); setCellSize\(fitCell\); return; \}/);
  assert.match(s, /if \(autoCell != null && cellSize === autoCell && fitCell > cellSize\) \{ setAutoCell\(fitCell\); setCellSize\(fitCell\); \}/);
  assert.match(s, /onChange=\{\(e\) => \{ cellTouched\.current = true; setAutoCell\(null\);/, "typing clears the auto cell");
});

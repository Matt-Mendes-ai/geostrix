// TASKS.csv #3864 (Scottie Gold review) — the drill plan's key took the bottom-right corner (the emptiest) where the plan's two caption lines are printed: its last row printed through
// 'Traces along the downhole surveys (minimum curvature)' (baselines 200.7 and 202.5 mm on a 1 : 6,000 sheet). Synthetic frame.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptiestCorner } from "../src/lib/drillPlan.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const W = 700, H = 500, KW = 200, KH = 120;
// holes in the three other corners, so the bottom right is the emptiest
const holes = [{ id: "a", ax: 40, ay: 40 }, { id: "b", ax: W - 60, ay: 40 }, { id: "c", ax: 40, ay: H - 60 }];

test("the key's bottom-right corner stops above the captions", () => {
  const old = emptiestCorner(holes, W, H, KW, KH);
  assert.equal(old.y, H - KH - 22, "the old corner: 22 px above the foot");
  const clear = 6 + 2 * (8 + 4) + 8 + 2; // GRID_INSET + two caption lines + their height: 40 px
  const now = emptiestCorner(holes, W, H, KW, KH, null, { bottomClear: clear });
  assert.equal(now.y, H - KH - clear);
  assert.equal(now.x, W - KW - 6);
  assert.ok(now.y + KH <= H - clear + 1e-9, "the key ends above the caption band");
  // never lower than the old corner, whatever is asked
  assert.equal(emptiestCorner(holes, W, H, KW, KH, null, { bottomClear: 5 }).y, H - KH - 22);
});

test("wiring: the plan asks for the caption band", () => {
  const d = read("../src/components/DrillPlanElement.jsx");
  assert.match(d, /const bottomClear = Math\.ceil\(GRID_INSET \+ capLines \* \(capFont \+ 4\) \+ capFont \+ 2\)/);
  assert.match(d, /emptiestCorner\(\[\.\.\.g\.holes, \.\.\.planned\], g\.w, g\.h, b\.w, b\.h, pts, \{ bottomClear \}\)/);
});

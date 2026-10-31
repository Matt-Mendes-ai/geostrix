// TASKS.csv #1090 — figure text sized for print: the factor that makes a figure's labels print at a point size where
// Layout places it (PLACED_W page px)
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportScale, printPx, printPt, PLACED_W } from "../src/lib/theme.js";

test("exportScale: a figure as wide as the placement keeps 8 pt labels at printPx(8); wider figures scale up, narrower never down", () => {
  assert.equal(PLACED_W, 700);
  assert.ok(Math.abs(exportScale(700, printPx(printPt.small)) - 1) < 1e-9);
  // a 4,100 px wide figure with 11 px labels: they must be drawn ~5.7x larger to print at 8 pt
  const s = exportScale(4100);
  assert.ok(Math.abs(11 * s * (PLACED_W / 4100) - printPx(printPt.small)) < 1e-9);
  assert.equal(exportScale(300), 1);
});

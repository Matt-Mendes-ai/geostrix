// TASKS.csv #3049 — measured first: a pan frame took 134 ms at Fit on a 6,390-collar project with five rasters and 1,040 contour lines. While a
// drag lasts the plan moves the picture it showed when the drag began, and draws every layer again on release
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the drag snapshot is taken on mouse down, blitted at the view's offset while the zoom is unchanged, and dropped on release with a redraw", () => {
  assert.match(p, /dragSnap\.current = \{ canvas: c, cx: v\.cx, cy: v\.cy, mPerPx: v\.mPerPx, w: cv\.width, h: cv\.height \};/);
  assert.match(p, /if \(drag\.current && snap && snap\.mPerPx === v\.mPerPx && snap\.w === cv\.width && snap\.h === cv\.height\) \{/);
  assert.match(p, /c2\.drawImage\(snap\.canvas, Math\.round\(\(\(snap\.cx - v\.cx\) \/ v\.mPerPx\) \* dpr\), Math\.round\(\(\(v\.cy - snap\.cy\) \/ v\.mPerPx\) \* dpr\)\);/);
  assert.match(p, /if \(was && dragSnap\.current\) \{ dragSnap\.current = null; setTick\(\(t\) => t \+ 1\); \}/);
});
test("the offset's sign: the view moving east moves the picture west; the view moving north moves it south (down the screen)", () => {
  const m = 10, snap = { cx: 1000, cy: 5000 };
  const dx = (snap.cx - 1100) / m, dy = (5100 - snap.cy) / m; // the view moved 100 m east and 100 m north
  assert.deepEqual([dx, dy], [-10, 10]);
});

// TASKS.csv #3228 / #3484 — Snapshot to Layout draws the plan again at 300 dpi of a full A3 sheet's long side (4,961 px), at least twice the
// screen's pixels, at most 8x and 36 megapixels, then goes back
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the capture ratio drives the canvas, the snapshot waits for the redraw and the ratio is restored", () => {
  assert.match(p, /const dpr = captureDpr \|\| window\.devicePixelRatio \|\| 1;/);
  assert.match(p, /drawnDpr\.current = dpr;/);
  assert.match(p, /const want = snapshotRatio\(size\.w, size\.h, window\.devicePixelRatio \|\| 1\);/);
  assert.match(p, /export const snapshotRatio = \(w, h, dpr = 1\) => Math\.min\(8, Math\.max\(2 \* dpr, SHEET_LONG_PX \/ Math\.max\(1, w, h\)\), Math\.sqrt\(36e6 \/ Math\.max\(1, w \* h\)\)\);/);
  assert.match(p, /setCaptureDpr\(want\); for \(let i = 0; i < 60 && drawnDpr\.current !== want; i\+\+\)/);
  assert.ok(p.indexOf("const src = cv.toDataURL") < p.indexOf("setCaptureDpr(null);"), "restored after the capture");
});
test("the ratio by hand: 1,920 x 1,080 -> 4,961 / 1,920 = 2.58 (a 4,961 x 2,790 picture, 13.8 MP); a small plan is held to 8x; a huge one to 36 MP", () => {
  const SHEET = 4961, want = (w, h, dpr) => Math.min(8, Math.max(2 * dpr, SHEET / Math.max(1, w, h)), Math.sqrt(36e6 / Math.max(1, w * h)));
  assert.ok(Math.abs(want(1920, 1080, 1) - 2.5839) < 1e-3);
  assert.ok(want(1920, 1080, 1) * 1920 >= 4961 - 1);
  assert.equal(want(400, 300, 1), 8);
  assert.equal(want(2000, 1000, 2), 4); // a retina screen on a wide plan: at least twice its ratio (4,961 / 2,000 = 2.5 is less)
  const big = want(6000, 5000, 1); assert.ok(6000 * 5000 * big * big <= 36.0001e6);
});

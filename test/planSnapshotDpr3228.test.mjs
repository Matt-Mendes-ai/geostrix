// TASKS.csv #3228 step B — Snapshot to Layout draws the plan again at twice the screen's pixels (at most 4x and 36 megapixels), then back
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the capture ratio drives the canvas, the snapshot waits for the redraw and the ratio is restored", () => {
  assert.match(p, /const dpr = captureDpr \|\| window\.devicePixelRatio \|\| 1;/);
  assert.match(p, /drawnDpr\.current = dpr;/);
  assert.match(p, /const want = Math\.min\(4, Math\.max\(2, 2 \* \(window\.devicePixelRatio \|\| 1\)\), Math\.sqrt\(36e6 \/ Math\.max\(1, size\.w \* size\.h\)\)\);/);
  assert.match(p, /setCaptureDpr\(want\); for \(let i = 0; i < 60 && drawnDpr\.current !== want; i\+\+\)/);
  assert.ok(p.indexOf("const src = cv.toDataURL") < p.indexOf("setCaptureDpr(null);"), "restored after the capture");
});
test("the pixel budget: a 1,920 x 1,080 plan at ratio 1 is captured at 2x (3,840 x 2,160 = 8.3 MP); a 5,000 x 4,000 plan is held to 36 MP", () => {
  const want = (w, h, dpr) => Math.min(4, Math.max(2, 2 * dpr), Math.sqrt(36e6 / Math.max(1, w * h)));
  assert.equal(want(1920, 1080, 1), 2);
  assert.equal(want(1920, 1080, 2), 4);
  assert.ok(want(5000, 4000, 1) < 1.35 && (5000 * 4000 * want(5000, 4000, 1) ** 2) <= 36.0001e6);
});

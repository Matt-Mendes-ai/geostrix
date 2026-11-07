// TASKS.csv #1486 — 'Enter & adjust view' on a fixed-scale frame threw the zoom away: the zoom's own scale now comes back and the
// sidebar offers it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixedScaleHalfHeight, scaleForHalfHeight, roundScale } from "../src/lib/layoutGeometry.js";

test("the scale a zoom framed is the inverse of the fixed-scale half-height", () => {
  for (const [n, w, a] of [[10000, 700, 1.7], [2500, 420, 1.33], [40000, 963, 2]]) {
    assert.ok(Math.abs(scaleForHalfHeight(fixedScaleHalfHeight(n, w, a), w, a) - n) < 1e-6);
  }
  assert.equal(scaleForHalfHeight(100, 0, 1.5), null);
  assert.equal(roundScale(38412), 38000);
  assert.equal(roundScale(10000), 10000);
  assert.equal(roundScale(1234), 1200);
  assert.equal(roundScale(0), null);
});

test("the capture returns it for an interactive fixed-scale frame; the store keeps it; the sidebar offers it", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(req\.fixedScale > 0 && req\.elementW > 0\) \{ if \(req\.interactive\) zoomScale = scaleForHalfHeight\(halfH, req\.elementW, aspect\); halfH = fixedScaleHalfHeight\(/);
  assert.match(v, /fixedScale: orthoHalfH != null && req\.fixedScale > 0 \? req\.fixedScale : null, zoomScale,/);
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(s, /adjustZoomScale: res\.zoomScale \|\| null/);
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(L, /Math\.abs\(sel\.adjustZoomScale \/ sel\.fixedScale - 1\) > 0\.05/);
  assert.match(L, /onClick=\{\(\) => \{ updateSelected\(\{ adjustZoomScale: null \}\); onRescale\(z\); \}\}>\{tr\("Use 1:\{z\}"/);
});

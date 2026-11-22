// TASKS.csv #4009 — the section window's view transform: zoom about the pointer, pan, fit, per-tab memory. Made-up extents.
import test from "node:test";
import assert from "node:assert/strict";
import { FIT, ZOOM_MAX, normalize, zoomAt, zoomBy, panBy, windowOf, zoomText, plotFraction, isFit, keepZoom, keptZoom, forgetZoom } from "../src/lib/sectionZoom.js";

const EXT = [-20, 380, 100, 300]; // minL, maxL, minZ, maxZ
const win = (v) => windowOf(v, ...EXT);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("fit is the whole drawing: the window is the extents, k 1", () => {
  const w = win(FIT);
  assert.deepEqual([w.k, w.L0, w.L1, w.Z0, w.Z1], [1, -20, 380, 100, 300]);
  assert.equal(isFit(FIT), true); assert.equal(isFit(null), true); assert.equal(isFit({ k: 2, fx: 0.5, fz: 0.5 }), false);
  assert.deepEqual(normalize({ k: 0.4, fx: 9, fz: -3 }), FIT, "below 1 is fit");
});

test("zoom about the pointer keeps the point under it where it is, at any zoom and any place", () => {
  // the data point under a plot fraction (px, pz) in a view
  const at = (v, px, pz) => { const w = win(v); return [w.L0 + px * (w.L1 - w.L0), w.Z0 + pz * (w.Z1 - w.Z0)]; };
  for (const [px, pz] of [[0.5, 0.5], [0.2, 0.7], [0.9, 0.1], [0.5, 0.95]]) {
    let v = FIT;
    for (const f of [1.25, 1.25, 2, 1.5, 3]) {
      const before = at(v, px, pz); v = zoomBy(v, f, px, pz); const after = at(v, px, pz);
      // inside the clamp the point stays; at the extents' edge the window is held inside them (the point then moves, never past the edge)
      const w = win(v);
      if (w.L0 > EXT[0] + 1e-9 && w.L1 < EXT[1] - 1e-9) near(after[0], before[0], 1e-6);
      if (w.Z0 > EXT[2] + 1e-9 && w.Z1 < EXT[3] - 1e-9) near(after[1], before[1], 1e-6);
    }
    assert.ok(v.k > 10);
  }
  // exactly: from the whole drawing, 4x about (0.25, 0.5) shows the quarter that starts at the left
  const v = zoomAt(FIT, 4, 0.25, 0.5), w = win(v);
  near(w.L0, -20 + 0.25 * 400 - 0.25 * 100, 1e-9); near(w.L1 - w.L0, 100, 1e-9);
  near(w.Z0, 100 + 0.5 * 200 - 0.5 * 50, 1e-9); near(w.Z1 - w.Z0, 50, 1e-9);
});

test("the window never leaves the fitted extents; zoom is capped; zooming out to 1 is fit", () => {
  for (const v of [zoomAt(FIT, 8, 0, 0), zoomAt(FIT, 8, 1, 1), panBy(zoomAt(FIT, 4), 5, -5), panBy(zoomAt(FIT, 4), -5, 5)]) {
    const w = win(v);
    assert.ok(w.L0 >= EXT[0] - 1e-9 && w.L1 <= EXT[1] + 1e-9 && w.Z0 >= EXT[2] - 1e-9 && w.Z1 <= EXT[3] + 1e-9, JSON.stringify(w));
  }
  assert.equal(zoomAt(FIT, 1000).k, ZOOM_MAX);
  assert.deepEqual(zoomAt(zoomAt(FIT, 4, 0.3, 0.3), 1, 0.3, 0.3), FIT);
  assert.deepEqual(zoomBy(zoomAt(FIT, 1.25), 1 / 1.25), FIT);
  assert.deepEqual(panBy(FIT, 0.3, 0.3), FIT, "nothing to pan at fit");
});

test("pan: the picture follows the hand (a drag right shows what was left of it), by fractions of the plot", () => {
  const v0 = zoomAt(FIT, 4, 0.5, 0.5), w0 = win(v0);
  const v1 = panBy(v0, 0.25, 0), w1 = win(v1);      // dragged a quarter of the plot to the right
  near(w1.L0, w0.L0 - 0.25 * (w0.L1 - w0.L0), 1e-9); near(w1.Z0, w0.Z0, 1e-9);
  const v2 = panBy(v0, 0, 0.5), w2 = win(v2);        // dragged half the plot UP: shows what was below
  near(w2.Z0, w0.Z0 - 0.5 * (w0.Z1 - w0.Z0), 1e-9); near(w2.L0, w0.L0, 1e-9);
  // the window keeps its size
  near(w1.L1 - w1.L0, w0.L1 - w0.L0); near(w2.Z1 - w2.Z0, w0.Z1 - w0.Z0);
});

test("the view survives a changed extent (VE, a resized window): it is fractions, so the same part of the section stays in view", () => {
  const v = zoomAt(FIT, 5, 0.7, 0.4), a = windowOf(v, 0, 100, 0, 50), b = windowOf(v, 0, 100, 0, 200);
  near(a.L0, b.L0); near(a.L1, b.L1);
  near((a.Z0 - 0) / 50, (b.Z0 - 0) / 200, 1e-9);
});

test("readout, the pointer's place in the plot, and the zoom kept per tab", () => {
  assert.deepEqual([zoomText(FIT), zoomText({ k: 2.5, fx: 0.5, fz: 0.5 }), zoomText({ k: 12.4, fx: 0.5, fz: 0.5 })], ["×1", "×2.5", "×12"]);
  const plot = { x0: 60, y0: 60, w: 880, h: 400 };
  assert.deepEqual(plotFraction(60, 460, plot), { px: 0, pz: 0 }, "the bottom left corner");
  assert.deepEqual(plotFraction(940, 60, plot), { px: 1, pz: 1 }, "the top right corner");
  assert.deepEqual(plotFraction(500, 260, plot), { px: 0.5, pz: 0.5 });
  assert.deepEqual(plotFraction(0, 9999, plot), { px: 0, pz: 0 }, "outside is held to the plot");
  const v = zoomAt(FIT, 3, 0.2, 0.8);
  keepZoom("tab-A", v); keepZoom("tab-B", zoomAt(FIT, 6));
  assert.deepEqual(keptZoom("tab-A"), v); assert.equal(keptZoom("tab-B").k, 6); assert.deepEqual(keptZoom("tab-C"), FIT);
  keepZoom("tab-A", FIT); assert.deepEqual(keptZoom("tab-A"), FIT, "fit forgets the tab's zoom");
  forgetZoom("tab-B"); assert.deepEqual(keptZoom("tab-B"), FIT);
  assert.deepEqual(keptZoom(null), FIT);
});

import fs from "node:fs";
test("wired: SectionSVG maps through the zoom window (exports and print at fit), the snap distance is 12 screen pixels, the window goes to the overview as a box, the toolbar has + / - / Fit and a readout", () => {
  const w = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /const win = windowOf\(printing \? null : zoom, minL, maxL, minZ, maxZ\);/, "an export (printing) draws the fitted section");
  assert.match(w, /const hScale = hScale0 \* win\.k, vScale = vScale0 \* win\.k;/, "both scales: the VE is unchanged");
  assert.match(w, /geomRef\.current = \{ hScale: hScale0, ve: vExag \}/, "Layout's snapshot scale is the fitted one");
  assert.match(w, /const H = Math\.max\(200, Math\.round\(\(maxZ - minZ\) \* vScale0\) \+ 2 \* PAD\);/, "the drawing's size is the fitted one");
  assert.match(w, /radius: 12 \/ \(pxPerUnit > 0 \? pxPerUnit : 1\)/, "the snap distance in screen pixels");
  assert.match(w, /onWheel[\s\S]*zoomBy\(zoomRef\.current,/); assert.match(w, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(w, /e\.button === 1 \|\| \(e\.button === 0 && spaceRef\.current\)/, "the middle button or Space + left drag pan; a plain left drag is drawing's");
  assert.match(w, /if \(modeRef\.current \|\| isFit\(zoomRef\.current\)\) return;/, "double-click returns to fit, but not while drawing, planning or editing");
  assert.match(w, /keptZoom\(tabId\)/); assert.match(w, /keepZoom\(tabId, n\)/);
  assert.match(w, /zoomWindow=\{zoomWin\}/); assert.match(w, /<span data-zoom-readout=/);
  const o = fs.readFileSync(new URL("../src/components/SectionOverview.jsx", import.meta.url), "utf8");
  assert.match(o, /<polygon data-zoom-box=/);
  // the zoom is never in a saved project: a view, kept per tab for the session only
  assert.doesNotMatch(fs.readFileSync(new URL("../src/lib/projectFields.js", import.meta.url), "utf8"), /zoom/i);
});

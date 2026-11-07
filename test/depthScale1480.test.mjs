// TASKS.csv #1480 — a strip log on a Layout page at an exact depth scale.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDepthImage, depthScaleDenom, depthHeightForScale } from "../src/lib/layoutGeometry.js";
const M_PER_PAGE_PX = 0.0254 / 96; // layoutGeometry.js: a 96 dpi page pixel
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

test("1 : N sets the height so a metre of hole is 1/N m of paper; the scale reads back", () => {
  const el = { type: "image", depthHeightAtCaptureM: 500, h: 300, w: 100 }; // the full image spans 500 m of hole
  assert.ok(isDepthImage(el));
  assert.ok(!isDepthImage({ type: "image", worldWidthAtCaptureM: 10 }));
  const h = depthHeightForScale(el, 5000);
  assert.ok(Math.abs(h * M_PER_PAGE_PX * 1000 - 100) < 1e-9, "500 m at 1 : 5,000 is 100 mm of paper");
  assert.ok(Math.abs(depthScaleDenom({ ...el, h }) - 5000) < 1e-9);
});

test("the Atlas strip log knows its metres per pixel", () => {
  const out = buildStripLogSvgMarkup({ holeId: "H1", collars: [{ hole_id: "H1", length: 300 }], layers: { litho: [{ hole_id: "H1", from: 0, to: 300, value: "LMST" }] } });
  assert.equal(out.pxPerMeter, 3); // 900 px / 300 m
  const src = readFileSync(new URL("../src/lib/striplogSvg.js", import.meta.url), "utf8");
  assert.match(src, /depthHeightAtCaptureM: height \/ pxPerMeter/);
});

test("wired: the strip-log window and Atlas send it, Layout keeps it and shows the control", () => {
  const s = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(s, /depthHeightAtCaptureM: fh \/ pxPerMeter/);
  const a = readFileSync(new URL("../src/lib/atlas.js", import.meta.url), "utf8");
  assert.match(a, /depthHeightAtCaptureM: built\.depthHeightAtCaptureM \?\? null/);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /depthHeightAtCaptureM: img\.depthHeightAtCaptureM \?\? null/);
  assert.match(l, /\{isDepthImage\(sel\) && <DepthScaleControls sel=\{sel\}/);
});

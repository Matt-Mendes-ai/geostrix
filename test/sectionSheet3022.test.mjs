// TASKS.csv #3022 (review #2876, WA iron) — Layout's part of the section sheet: a picked 1 : 5,000 read '1 : 5,002 along the section' after a
// re-snapshot (the width was rounded to whole pixels and the scale read back from it), and a scale bar bound to an 8x section did not say it
// measures along the section only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionScaleDenom, sectionWidthForScale, sectionScaleText } from "../src/lib/layoutGeometry.js";
import { withLiveScaleBars } from "../src/lib/layoutLinks.js";

test("a width set from a scale gives that scale back exactly; a rounded one did not", () => {
  const el = { type: "image", worldWidthAtCaptureM: 1037.3, w: 700, verticalExaggeration: 8 };
  const exact = { ...el, w: sectionWidthForScale(el, 5000) };
  assert.equal(Math.round(sectionScaleDenom(exact)), 5000);
  assert.match(sectionScaleText(exact), /^1 : 5,000 along the section, 8x vertical exaggeration$/);
  const rounded = { ...el, w: Math.round(sectionWidthForScale(el, 5000)) };
  assert.notEqual(Math.round(sectionScaleDenom(rounded)), 5000, "the old rounding drifted");
});

test("a bar bound to a section with vertical exaggeration says it is the horizontal scale; on a plan view it does not", () => {
  const sec = { id: "s1", type: "image", worldWidthAtCaptureM: 1000, w: 600, h: 300, verticalExaggeration: 8 };
  const flat = { id: "s2", type: "image", worldWidthAtCaptureM: 1000, w: 600, h: 300, verticalExaggeration: 1 };
  const bars = withLiveScaleBars([sec, flat, { id: "b1", type: "scale", boundTo: "s1", meters: 100 }, { id: "b2", type: "scale", boundTo: "s2", meters: 100 }]);
  assert.equal(bars.find((e) => e.id === "b1").horizontalVe, 8);
  assert.equal(bars.find((e) => e.id === "b2").horizontalVe, 0);
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(L, /\{el\.horizontalVe > 1 && <text [^\n]*\{tr\("horizontal scale \(\{ve\}x vertical exaggeration\)", \{ ve: el\.horizontalVe \}\)\}<\/text>\}/);
  assert.match(L, /const w = denom && world \? sectionWidthForScale\(\{ worldWidthAtCaptureM: world \}, denom\) : el\.w;/);
});

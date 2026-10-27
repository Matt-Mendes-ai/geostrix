// TASKS.csv #944 — a cross-section snapshot in Layout: its horizontal plot scale at its size on the page, the width for
// 1 : N, and the page's {scale} when it holds only sections
import test from "node:test";
import assert from "node:assert/strict";
import { sectionScaleDenom, sectionWidthForScale, sectionScaleText, pageScaleText } from "../src/lib/layoutGeometry.js";

const PX = 0.0254 / 96; // metres of paper per page px
// a snapshot whose full width shows 900 m of section, 700 page px wide
const sec = { type: "image", worldWidthAtCaptureM: 900, w: 700, h: 500, aspect: 1.4, verticalExaggeration: 1 };

test("#944 the scale of a section snapshot follows its width on the page; 1 : N gives back that width", () => {
  assert.ok(Math.abs(sectionScaleDenom(sec) - 900 / (700 * PX)) < 1e-6);
  const w = sectionWidthForScale(sec, 2500);
  assert.ok(Math.abs(w * PX * 2500 - 900) < 1e-9); // 900 m at 1:2,500 is 0.36 m of paper
  assert.equal(Math.round(sectionScaleDenom({ ...sec, w })), 2500);
  assert.equal(sectionScaleText({ ...sec, w }), "1 : 2,500 along the section");
  assert.equal(sectionScaleText({ ...sec, w, verticalExaggeration: 2 }), "1 : 2,500 along the section, 2x vertical exaggeration");
  assert.equal(sectionScaleDenom({ type: "image", w: 100 }), null); // a photo or logo: no scale
});

test("#944 {scale} on a page with only a section reads the section; a viewport still wins", () => {
  const w = sectionWidthForScale(sec, 1000);
  assert.equal(pageScaleText([{ type: "text" }, { ...sec, w }]), "1 : 1,000 along the section");
  const vp = { type: "viewport", trueScale: true, capturedFixedScale: 5000 };
  assert.equal(pageScaleText([{ ...sec, w }, vp]), "1 : 5,000");
  assert.equal(pageScaleText([{ type: "text" }]), "");
});

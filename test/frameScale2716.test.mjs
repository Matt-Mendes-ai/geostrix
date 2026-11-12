// TASKS.csv #2716 — a page with frames at several scales: each frame can print its own scale in its corner
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewportScaleText } from "../src/lib/layoutGeometry.js";

test("each frame names its own scale (the caption's source)", () => {
  assert.equal(viewportScaleText({ trueScale: true, fixedScale: 50000, capturedFixedScale: 50000 }), `1 : ${(50000).toLocaleString()}`);
  assert.equal(viewportScaleText({ trueScale: true, fixedScale: 500000, capturedFixedScale: 500000 }), `1 : ${(500000).toLocaleString()}`);
  assert.equal(viewportScaleText({}), null, "no capture, no scale: the option is off");
});

test("wired: the checkbox and the caption in the frame", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /onChange=\{\(e\) => updateSelected\(\{ scaleCaption: e\.target\.checked \}\)\} \/>\{tr\("Print its scale in the frame"\)\}/);
  assert.match(m, /\{el\.scaleCaption && viewportScaleText\(el\) && \(/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["Print its scale in the frame"], lang);
    assert.ok(Object.entries(d).some(([k, v]) => k.startsWith("Print this frame's scale ({s})") && v.includes("{scale}") && v.includes("{s}")), `${lang}: both placeholders kept`);
  }
});

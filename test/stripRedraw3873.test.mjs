// TASKS.csv #3873 (a) (Matt's decision, 2026-11-17) — a strip log drawn at too low a px per metre for the depth scale chosen in Layout is drawn again from there: the element keeps the choices it was sent with (stripSpec),
// 'Draw it again' reopens the strip log in the 3D View with them at the px per metre the scale needs, and its 'Add to Layout' replaces that element, at the same place and the same depth scale 1 : N.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redrawAdvice } from "../src/lib/stripLogPages.js";
import { depthScaleDenom, depthHeightForScale } from "../src/lib/layoutGeometry.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the px per metre the request carries is the one the depth scale needs", () => {
  const el = { type: "image", naturalW: 300, naturalH: 720, depthHeightAtCaptureM: 1000, w: 300, h: 100 }; // drawn at 0.72 px/m
  const adv = redrawAdvice(el, 1000);
  assert.ok(Math.abs(adv.ppmNeeded - 3.78) < 0.01 && adv.enlarge > 5);
});

test("the replacement keeps the depth scale: the new picture is as tall on paper as 1 : N asks", () => {
  const el = { type: "image", naturalW: 300, naturalH: 720, depthHeightAtCaptureM: 1000, w: 300, h: 100 };
  const denom = depthScaleDenom(el);
  const next = { ...el, naturalW: 300, naturalH: 3780, depthHeightAtCaptureM: 1000 }; // the same hole length, drawn at 3.78 px/m
  const h = depthHeightForScale(next, denom);
  assert.ok(Math.abs(h - el.h) < 1e-6, `the height on paper is unchanged: ${h}`);
});

test("wiring: StripLog starts from the sent choices and sends them; the store, the 3D View and Layout carry the request and the replacement", () => {
  const sl = read("../src/components/StripLog.jsx");
  assert.match(sl, /initial = null, replaceElementId = null \}\)/);
  assert.match(sl, /useState\(initial\?\.pxPerMeter > 0 \? initial\.pxPerMeter : 6\)/);
  assert.match(sl, /if \(initial\) return; \/\/ #3873 \(a\)/);
  assert.match(sl, /stripSpec: \{ holeId, assaySymbol, extraSymbols, logScale, rangeFrom, rangeTo, pxPerMeter \}/);
  assert.match(sl, /\.\.\.\(replaceElementId \? \{ replaceElementId \} : \{\}\)/);
  const st = read("../src/lib/store.jsx");
  assert.match(st, /const requestStripLogRedraw = useCallback\(\(req\) => \{ setStripLogRequest\(req\); goToModule\("viewer"\); \}, \[goToModule\]\)/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /if \(!stripLogRequest \|\| !visible\) return;/);
  assert.match(v, /initial=\{stripRedo\?\.spec \|\| null\} replaceElementId=\{stripRedo\?\.elementId \|\| null\}/);
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /if \(img\.depthHeightAtCaptureM > 0 && el\.depthHeightAtCaptureM > 0\) \{/);
  assert.match(l, /const h = denom > 0 \? depthHeightForScale\(upd0, denom\) : el\.h;/);
  assert.match(l, /onRedraw=\{sel\.stripSpec && !sel\.slice \? \(ppm\) => requestStripLogRedraw\(/);
  assert.match(l, /\.\.\.\(img\.stripSpec \? \{ stripSpec: img\.stripSpec \} : \{\}\)/);
});

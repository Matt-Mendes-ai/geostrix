// TASKS.csv #1480 — the strip log goes to Layout with its tracks and a bound legend; a tall image fits the sheet
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripLogTextPt } from "../src/lib/atlas.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("the strip log window sends the exported figure and its colour-track legend", () => {
  const src = read("src/components/StripLog.jsx");
  assert.match(src, /exportSvgMarkup\(svg, \{ furniture: furniture\(\) \}\);\s*const legendItems = tracks\.filter\(\(t\) => t\.kind === "fill" \|\| t\.kind === "struct"\)/);
  assert.match(src, /onAddToLayout\(\{ label: `Strip log — \$\{holeId\}`/);
  assert.match(src, /\{onAddToLayout && <button onClick=\{addToLayout\}/);
  assert.match(read("src/modules/ViewerModule.jsx"), /onAddToLayout=\{\(img\) => \{ addLayoutImage\(img\); goToModule\("layout"\); \}\} \/\/ #1480/);
});

test("Layout caps a queued image at the sheet height", () => {
  assert.match(read("src/modules/LayoutModule.jsx"), /const maxH = A4\.h - 160, w = Math\.round\(Math\.min\(maxW, 700, maxH \* aspect\)\);/);
});

test("a 3,000 px log fitted to a 634 px sheet height prints its labels too small to read", () => {
  assert.ok(stripLogTextPt(3000, 634) < 6);
  assert.ok(stripLogTextPt(700, 634) > 6);
});

// TASKS.csv #3874 (#3713) — the strip-log figure's key gives each assay bar's colour classes as the 3D legend words them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const strip = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const view = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the prop is the 3D View's class breaks per element", () => {
  assert.match(view, /assayClasses=\{\(sym\) => assayStyle\[sym\]\?\.breaks\}/);
  assert.match(strip, /replaceElementId = null, assayClasses = null \}\)/);
});

test("one key row per assay bar with classes: <= first, a-b between, > last; the figure grows by 14 px a row", () => {
  assert.match(strip, /i === 0 \? `≤ \$\{fmtLegendValue\(b\.max\)\}` : i === br\.length - 1 \? `> \$\{fmtLegendValue\(br\[i - 1\]\.max\)\}` : `\$\{fmtLegendValue\(br\[i - 1\]\.max\)\}–\$\{fmtLegendValue\(b\.max\)\}`/);
  assert.match(strip, /const keyH = \(hasCalc \? 38 : 0\) \+ classKeys\.length \* 16;/); // #3900: the key rows at 10 px
  assert.match(strip, /\{classKeys\.map\(\(k, ki\) =>/);
});

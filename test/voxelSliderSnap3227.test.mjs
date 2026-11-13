// TASKS.csv #3227 (from #2969, WA iron) — the block-model range slider applied 3.34475 while the box beside it read the value at 4 significant
// figures: the slider's value is now taken at the box's precision (the ends stay the model's own min / max).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
const box = fs.readFileSync(new URL("../src/components/VoxelRangeNumber.jsx", import.meta.url), "utf8");

// the slider rule as written, on a linear model from 0.1 to 8801.23 (200 steps)
const model = { min: 0.1, max: 8801.23 };
const sMin = model.min, sMax = model.max, sStep = (sMax - sMin) / 200, fromS = (s) => s;
const fromSlider = eval(`(${src.match(/const fromSlider = (\(raw\) => \([^\n]*\));/)[1]})`);
const show = (v) => String(Number(Number(v).toPrecision(4))); // VoxelRangeNumber's

test("a step between the ends is stored as the box shows it", () => {
  for (const k of [1, 7, 50, 133, 199]) {
    const raw = sMin + k * sStep, v = fromSlider(raw);
    assert.equal(String(v), show(v), `step ${k}: ${v}`);
    assert.ok(Math.abs(v - raw) <= Math.abs(raw) * 5e-4);
  }
});

test("the ends are the model's own min and max, not a rounded value that would hide the end cells", () => {
  assert.equal(fromSlider(sMax), 8801.23);
  assert.equal(fromSlider(sMin), 0.1);
  assert.equal(show(8801.23), "8801", "(what rounding alone would have stored)");
});

test("wiring: both sliders use it; the box is still 4 significant figures", () => {
  assert.match(src, /onMinInput\(Math\.min\(fromSlider\(Number\(e\.target\.value\)\), dispMax\)\)/);
  assert.match(src, /onMaxInput\(Math\.max\(fromSlider\(Number\(e\.target\.value\)\), dispMin\)\)/);
  assert.match(box, /const show = \(v\) => String\(Number\(Number\(v\)\.toPrecision\(4\)\)\);/);
});

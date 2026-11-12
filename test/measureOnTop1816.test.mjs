// TASKS.csv #1816 (review #1646, Kodiak) — the Measure readout sat in the ribbon (moved to a card over the view by #1471 / #1538), and the
// measured line was mostly hidden inside the block models: it is now drawn on top.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#1816 the measure line and the area's closing line draw on top; the readout is a floating card", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /LineBasicMaterial\(\{ color: MEASURE_COLOR, transparent: true, opacity: 0\.95, depthTest: false \}\)/);
  assert.match(v, /LineDashedMaterial\(\{ color: MEASURE_COLOR, dashSize: 3, gapSize: 2, transparent: true, opacity: 0\.85, depthTest: false \}\)/);
  assert.match(v, /solidLine\.renderOrder = 999;/);
  assert.match(readFileSync(new URL("../src/components/MeasureResults.jsx", import.meta.url), "utf8"), /createPortal\(<MeasureCard \{\.\.\.props\} \/>, document\.body\)/);
});

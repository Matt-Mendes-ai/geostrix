// TASKS.csv #1790 — the legend editor printed raw floats. The stops and the 'to …' class captions were rounded by #1422; the block model's
// Range min / max inputs still showed '14.915215962069169'. They now go through StopValueInput with readableValues, as the stops do.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readableValues } from "../src/lib/layers.js";

test("the review's floats read with the fewest figures that keep them apart", () => {
  assert.deepEqual(readableValues([14.915215962069169, 5224.333]), [14.9, 5220]);
  assert.deepEqual(readableValues([3.6653824999999998, 6.469356949060653]), [3.67, 6.47]);
  assert.deepEqual(readableValues([0.0013268500000000183, 0.00133]), [0.001327, 0.00133]); // close values keep a 4th figure
});

test("the Range inputs use StopValueInput with the rounded values", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const rangeShown = useMemo\(\(\) => readableValues\(\[model\.min, model\.max\]\)/);
  assert.match(src, /<StopValueInput value=\{model\.min\} shown=\{rangeShown\[0\]\}/);
  assert.match(src, /<StopValueInput value=\{model\.max\} shown=\{rangeShown\[1\]\}/);
  assert.doesNotMatch(src, /<input type="number" value=\{model\.min\}/);
});

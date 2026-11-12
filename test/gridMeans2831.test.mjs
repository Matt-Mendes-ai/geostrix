// TASKS.csv #2831 (GSC geophysics review A1) — a grid over 512 nodes a side is kept as block means: its peak (Athabasca eU 417.5) was lost to
// every number the card shows. Each block's highest / lowest value and the averaged values' range are now kept, and the stretch / colour bar
// and the contour message say the numbers are block means and give the source range. SYNTHETIC grid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeValueGrid } from "../src/lib/raster.js";
import { averagedInfo, averagedRangeText, missedLevelsText, blockExtremesAt, meanRange } from "../src/lib/gridMeans.js";
import { f32ToB64 } from "../src/lib/inversion.js";

// 1,230 x 858 nodes (the Athabasca grid's size): background 5, one 417.5 node, one -3.36 node
const NX = 1230, NY = 858, vals = new Float32Array(NX * NY).fill(5);
vals[400 * NX + 600] = 417.5; vals[100 * NX + 100] = -3.36;
const g = makeValueGrid(vals, NX, NY, 0, NY * 10, 10, 10, (v) => !Number.isFinite(v));

test("the averaged grid keeps each block's extremes and the source range", () => {
  assert.equal(g.averagedBy, 3);
  assert.deepEqual([g.nx, g.ny], [410, 286]);
  const k = Math.floor(400 / 3) * g.nx + Math.floor(600 / 3);
  assert.ok(Math.abs(g.values[k] - (8 * 5 + 417.5) / 9) < 1e-3); // the peak's block mean: 50.83
  assert.equal(g.maxValues[k], 417.5);
  assert.equal(Math.round(g.minValues[Math.floor(100 / 3) * g.nx + Math.floor(100 / 3)] * 100) / 100, -3.36);
  assert.deepEqual(g.sourceRange.map((v) => Math.round(v * 100) / 100), [-3.36, 417.5]);
  const small = makeValueGrid(new Float32Array(100).fill(1), 10, 10, 0, 100, 10, 10, () => false);
  assert.equal(small.averagedBy, 1);
  assert.equal(small.maxValues, undefined); // not averaged: nothing extra
});

test("what the card says: block means and the source's own range; a contour level only the source reaches", () => {
  const stored = { ...g, values: f32ToB64(g.values), maxValues: f32ToB64(g.maxValues), minValues: f32ToB64(g.minValues) };
  const info = averagedInfo(stored);
  assert.equal(info.f, 3);
  assert.deepEqual(info.source.map((v) => Math.round(v * 100) / 100), [-3.36, 417.5]);
  assert.ok(info.means[1] < 51 && info.means[0] > 3.9);
  assert.match(averagedRangeText(info), /^These are 3 × 3 block means, 4\.\d+ to 50\.83; the source grid's own values run -3\.36 to 417\.5\.$/);
  const t = missedLevelsText([10, 200], [10], info);
  assert.match(t, /^No line at 200: the grid's values run 4\.\d+ to 50\.83\. They are 3 × 3 block means; the source grid reaches -3\.36 to 417\.5/);
  assert.equal(missedLevelsText([10], [10], info), "");
  assert.equal(averagedInfo({ ...stored, averagedBy: 1 }), null); // a grid kept at full resolution: nothing to say
  assert.match(averagedRangeText(averagedInfo({ ...stored, sourceRange: null })), /the source grid's own extremes are beyond them/);
  const e = blockExtremesAt(stored, Math.floor(600 / 3), Math.floor(400 / 3));
  assert.deepEqual([e.max, e.n], [417.5, 9]);
  assert.deepEqual(meanRange([NaN, 2, -1]), [-1, 2]);
});

test("the raster keeps the extremes, and the card and contours say it", () => {
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /\.\.\.\(g\.maxValues && g\.averagedBy > 1 \? \{ maxValues: f32ToB64\(g\.maxValues\), minValues: f32ToB64\(g\.minValues\), sourceRange: g\.sourceRange \} : \{\}\)/);
  const c = readFileSync(new URL("../src/components/RasterColourControls.jsx", import.meta.url), "utf8");
  assert.match(c, /\{avg && <div [^>]*>\{averagedRangeText\(avg\)\}<\/div>\}/);
  const k = readFileSync(new URL("../src/components/GridContourControls.jsx", import.meta.url), "utf8");
  assert.match(k, /if \(!res\.length\) \{ setMsg\(tr\("None of those levels crosses the grid\."\) \+ \(missed \? " " \+ missed : ""\)\); return; \}/);
});

// TASKS.csv #3883 (#3810) — the level grids of one 3D cloud share one colour stretch, the cloud's values over the whole range: each level used to be
// stretched over its own values, so one colour meant a different value on each level. SYNTHETIC grids; a minimal canvas stands in for the browser's.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }), toDataURL: () => "data:image/png;base64," }) };
const { gridValuesToRasterInput } = await import("../src/lib/idw.js");

test("#3810 two levels with different ranges: their own stretch differs; with the cloud's values they share one", () => {
  const low = Float32Array.from({ length: 100 }, (_, i) => 1 + i / 10), high = Float32Array.from({ length: 100 }, (_, i) => 50 + i / 2); // 1-11 and 50-99.5
  const opts = { xmin: 0, ymax: 100, cellSize: 10, name: "L", stretch: "linear" };
  const a = gridValuesToRasterInput(low, 10, 10, opts), b = gridValuesToRasterInput(high, 10, 10, opts);
  assert.notDeepEqual(a.colourRange, b.colourRange, "before: each its own");
  const cloud = Float64Array.from([...low, ...high]);
  const a2 = gridValuesToRasterInput(low, 10, 10, { ...opts, stretchFrom: cloud }), b2 = gridValuesToRasterInput(high, 10, 10, { ...opts, stretchFrom: cloud });
  assert.deepEqual(a2.colourRange, b2.colourRange);
  assert.deepEqual(a2.colourRange, [1, 99.5]);
  assert.deepEqual([a2.gridMin, a2.gridMax], [1, 10.899999618530273], "each grid's own data range is still its own");
  const flat = gridValuesToRasterInput(new Float32Array(100).fill(7), 10, 10, { ...opts, stretchFrom: cloud });
  assert.deepEqual(flat.colourRange, [1, 99.5], "a level of one value takes the shared colour too");
});

test("#3810 the level set passes the cloud's values over its whole range to every level", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /const shared = Float64Array\.from\(rows3\.filter\(\(r\) => r\.z >= wins\[0\]\.lo && r\.z <= wins\[wins\.length - 1\]\.hi && Number\.isFinite\(r\.value\)\)\.map\(\(r\) => r\.value\)\);/);
  assert.match(g, /idwGridToRasterInput\(pts, \{ \.\.\.box, cellSize: idwCellSize, power: idwPower, stretch: idwStretch, maxDistance: blank, name, stretchFrom: shared \}\)/);
  assert.match(g, /addRaster\(\{ \.\.\.raster, elevation: median\(zs\), provenance: \{ tool: "IDW gridding \(level set\)"/, "each level at its own elevation (as before)");
});

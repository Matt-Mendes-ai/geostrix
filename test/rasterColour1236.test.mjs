import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rasterRGBA, rasterRange, rasterStops, rampRgb, DEFAULT_RASTER_STYLE } from "../src/lib/rasterColour.js";
import { rasterLegendGroups } from "../src/lib/legendGroups.js";
import { PALETTES, VIRIDIS_ANCHORS } from "../src/lib/layers.js";

const values = Float32Array.from([...Array(101).keys()]);
test("the default style draws what the importer drew: viridis over 2-98 %", () => {
  const { rgba, lo, hi } = rasterRGBA(values, DEFAULT_RASTER_STYLE);
  assert.deepEqual([lo, hi], [2, 98]);
  const first = [...rgba.slice(0, 3)], last = [...rgba.slice(100 * 4, 100 * 4 + 3)];
  assert.deepEqual(first, VIRIDIS_ANCHORS[0].map(Math.round));
  assert.deepEqual(last, VIRIDIS_ANCHORS[VIRIDIS_ANCHORS.length - 1].map(Math.round));
});
test("a blank node stays transparent; inverting swaps the ends", () => {
  const v = Float32Array.from([0, NaN, 10]);
  const a = rasterRGBA(v, { palette: "grayscale", stretch: "linear" }).rgba, b = rasterRGBA(v, { palette: "grayscale", stretch: "linear", invert: true }).rgba;
  assert.equal(a[7], 0); assert.equal(a[3], 255);
  assert.deepEqual([...a.slice(0, 3)], [...b.slice(8, 11)]);
  assert.deepEqual([...a.slice(8, 11)], [...b.slice(0, 3)]);
});
test("a typed range saturates outside it; an impossible one falls back", () => {
  const r = rasterRange(values, { stretch: "custom", min: 10, max: 20 });
  assert.deepEqual([r.lo, r.hi, r.t(5), r.t(15), r.t(50)], [10, 20, 0, 0.5, 1]);
  assert.equal(rasterRange(values, { stretch: "custom", min: 20, max: 10 }).lo, 2);
  assert.equal(rasterRange(values, { stretch: "custom" }).hi, 98);
});
test("the ramp interpolates between its anchors", () => {
  assert.deepEqual(rampRgb([[0, 0, 0], [100, 200, 50]], 0.5), [50, 100, 25]);
  assert.deepEqual(rampRgb([[0, 0, 0], [100, 200, 50]], 1), [100, 200, 50]);
});
test("the legend carries the range and the ramp, and says when colour does not scale", () => {
  const stops = rasterStops({ palette: "grayscale" }, 0, 100);
  assert.equal(stops[0].value, 0); assert.equal(stops.at(-1).value, 100);
  assert.equal(stops[0].color.toLowerCase(), PALETTES.grayscale.colors[0].toLowerCase());
  assert.equal(rasterStops({ palette: "grayscale", invert: true }, 0, 100)[0].color.toLowerCase(), PALETTES.grayscale.colors.at(-1).toLowerCase());
  const base = { id: 1, name: "Res", colourRange: [0, 100], colourStops: stops };
  const [g] = rasterLegendGroups([base]);
  assert.equal(g.label, "Res"); assert.ok(g.ramp);
  assert.equal(rasterLegendGroups([{ ...base, colourStyle: { stretch: "equalise" } }])[0].label, "Res (equalized)");
  assert.equal(rasterLegendGroups([{ ...base, visible: false }, { id: 2, name: "RGB" }]).length, 0);
});
test("a new style rebuilds the drape's texture, and an RGB ternary is not offered it", () => {
  assert.match(readFileSync("src/lib/viewer/sceneBuilders.js", "utf8"), /r\.colourStyle \? JSON\.stringify\(r\.colourStyle\)/);
  assert.match(readFileSync("src/modules/RasterModule.jsx", "utf8"), /r\.grid && !r\.ternary && <RasterColourControls/);
  assert.match(readFileSync("src/lib/raster.js", "utf8"), /^    ternary: \{/m);
  assert.match(readFileSync("src/modules/ViewerModule.jsx", "utf8"), /\}, \[rasters, sampleLegendGroup,/); // the legend follows a new style
});

// TASKS.csv #1858 — a raster says what its values are: a 'Values are' unit on a value raster, printed under its colour bar and in its
// contour levels; a picture raster says 'picture only' and can carry the map's own colour bar as an image
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rasterUnitOf } from "../src/lib/rasterMethod.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#1858 a raster's unit: typed or the survey's, else the element's, else the terrain derivative's", () => {
  assert.equal(rasterUnitOf({ unit: " mV/V " }), "mV/V");
  assert.equal(rasterUnitOf({ unit: "ppb", geochem: { unit: "ppm" } }), "ppb"); // typed on the card wins
  assert.equal(rasterUnitOf({ geochem: { unit: "ppm" } }), "ppm");
  assert.equal(rasterUnitOf({ terrainDerivative: { unit: "°" } }), "°");
  assert.equal(rasterUnitOf({}), "");
  assert.equal(rasterUnitOf(null), "");
});

test("#1858 the card: the unit field, the unit under the bar, the picture note and its colour bar", () => {
  const c = read("components/RasterColourControls.jsx");
  assert.match(c, /tr\("Values are"\)/);
  assert.match(c, /onUpdate\(r\.id, \{ unit: unitText\.trim\(\) \}\)/);
  assert.match(c, /\{unit && <span>\{unit\}<\/span>\}/);
  assert.match(read("components/GridContourControls.jsx"), /const unit = rasterUnitOf\(raster\)/);
  const m = read("modules/RasterModule.jsx");
  assert.match(m, /\{!r\.grid && !r\.ternary && !r\.legend && r\.dataUrl && <RasterPictureLegend raster=\{r\} updateRaster=\{updateRaster\} \/>\}/);
  const p = read("components/RasterPictureLegend.jsx");
  assert.match(p, /Picture only: colours, no values\./);
  assert.match(p, /updateRaster\(r\.id, \{ legendImage: \{ dataUrl: await legendDataUrl\(file\), name: file\.name \} \}\)/);
  assert.match(p, /updateRaster\(r\.id, \{ legendImage: null \}\)/);
});

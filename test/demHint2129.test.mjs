// TASKS.csv #2129 — deerhorn_dem.tif (one float band, 950-1,140) through GeoTIFF / GXF became a value raster offered as inversion
// survey points, with no hint that it is ground. The notice now points to Terrain > Import SRTM/DEM when the grid reads as an elevation model.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeDem } from "../src/lib/raster.js";

test("by name", () => {
  assert.equal(looksLikeDem("deerhorn_dem", 950, 1140), true);
  assert.equal(looksLikeDem("Lidar_DTM_1m", 0, 5), true);
  assert.equal(looksLikeDem("SRTM N56W129", 200, 2000), true);
  assert.equal(looksLikeDem("democrat_creek_mag", 950, 1140), false); // 'dem' only as a whole word
});

test("by values near the collars, not for a survey channel", () => {
  const collarZ = [1000, 1161];
  assert.equal(looksLikeDem("grid_7", 950, 1140, collarZ), true);
  assert.equal(looksLikeDem("grid_7", 950, 1140, null), false); // no collars, no name: say nothing
  assert.equal(looksLikeDem("TMI_residual", 950, 1140, collarZ), false);
  assert.equal(looksLikeDem("Cu_ppm_idw", 950, 1140, collarZ), false);
  assert.equal(looksLikeDem("grid_7", 400, 600, collarZ), false); // far below the collars
  assert.equal(looksLikeDem("grid_7", 1000, 1004, collarZ), false); // a flat 4 m spread
});

test("the raster import adds the hint and the Maps import passes the collars' range", () => {
  assert.match(readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8"), /looksLikeDem\(parsed\.name, colour\.colourRange\[0\], colour\.colourRange\[1\], collarZ\)/);
  assert.match(readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8"), /collarZ: collarZRange\(collars\), mineSource: mineSourceOf\(project\), sideCrs \}\);/); // mineSource: #2684
});

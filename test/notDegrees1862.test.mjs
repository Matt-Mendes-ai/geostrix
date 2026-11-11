// TASKS.csv #1862 — a GeoTIFF tagged EPSG:4326 whose bounds ran lon -180..1900, lat -2290..90 was 'reprojected' into a raster 15,500 x
// 38,600 km wide without a word. Degrees outside +-180 / +-90 are not degrees: not reprojected, said, and the Source CRS asked for.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notDegrees } from "../src/lib/raster.js";

test("bounds that cannot be longitude / latitude under a geographic tag", () => {
  assert.equal(notDegrees(4326, [-180, -2290, 1900, 90]), true); // the review's file
  assert.equal(notDegrees(4326, [410000, 6250000, 412000, 6252000]), true); // UTM metres tagged as degrees
  assert.equal(notDegrees(4326, [-129.1, 56.0, -129.0, 56.05]), false);
  assert.equal(notDegrees(4326, [-180, -90, 180, 90]), false); // a world raster
  assert.equal(notDegrees(28350, [410000, 6250000, 412000, 6252000]), false); // a projected tag: not this check
  assert.equal(notDegrees(4326, null), false);
});

test("the import says so and keeps the file's numbers", () => {
  const src = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  const i = src.indexOf("srcEpsg !== projEpsg && notDegrees(srcEpsg, parsed.bbox)"), j = src.indexOf("reprojectImageRGBA({ xmin, ymin, xmax, ymax, width, height, data }");
  assert.ok(i > 0 && i < j, `${i} ${j}`); // checked before the reprojection branch
  assert.match(src, /are not degrees: it was NOT reprojected and kept its own numbers/);
});

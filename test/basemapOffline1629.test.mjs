// TASKS.csv #1629 — the area picker draws the project's collars and offered extents (offline too), does not re-ask failed tiles,
// and its bottom bar wraps.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("collars reprojected to lon / lat and drawn; areas outlined; failed tiles skipped; the bar wraps", () => {
  const s = fs.readFileSync("src/components/BasemapView.jsx", "utf8");
  assert.match(s, /const q = reprojectXY\(w\.x, w\.y, epsg, 4326\);/); // w: the collar, through a tied grid's tie first since #2648
  assert.match(s, /<circle key=\{i\} cx=\{p\.wx \+ offsetX\}/);
  assert.match(s, /failedTiles\.current\.has\(tileUrlFor\(/);
  assert.match(s, /failedTiles\.current\.add\(tileUrlFor\(/);
  assert.match(s, /flexWrap: "wrap"/);
});

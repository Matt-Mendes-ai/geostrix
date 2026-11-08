// TASKS.csv #1507 — a GeoTIFF dropped on the Maps tab's map (not only its raster sidebar) imports.
// #2019 — the map now routes every kind of file (mapsDropRoutes); rasters still go to the raster import with the same extensions.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mapsDropRoutes } from "../src/lib/mapLayerBuild.js";

test("the Maps map takes dropped files and hands the rasters to the raster import", () => {
  const m = fs.readFileSync("src/modules/MapsModule.jsx", "utf8");
  assert.deepEqual(mapsDropRoutes(["a.tif", "b.tiff", "c.gxf", "d.grd"]).raster, ["a.tif", "b.tiff", "c.gxf", "d.grd"]);
  assert.equal((m.match(/\{\.\.\.mapDrop\}/g) || []).length, 2, "both the plan view and the empty card");
  assert.match(m, /setPane\("raster"\);\s*requestModuleAction\("import-raster-files", \{ files, others, notes \}\);/);
  const r = fs.readFileSync("src/modules/RasterModule.jsx", "utf8");
  assert.match(r, /useModuleAction\(\["import-raster-files"\], \(_a, p\) => \{\s*\(p\?\.files \|\| \[\]\)\.forEach\(\(f\) => importRaster\(f\)\);/);
  // the same extensions as the sidebar's own drop
  assert.match(r, /\/\\.\(tiff\?\|gxf\|grd\)\$\/i\.test\(f\.name\)/);
});

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
  assert.match(r, /useModuleAction\(\["import-raster-files"\], \(_a, p\) => \{\s*importRasterFiles\(p\?\.files \|\| \[\]/); // #2857 — with their side files
  // the same pairing as the sidebar's own drop (#2857: lib/rasterSideFiles.js holds the extensions)
  assert.match(r, /importRasterFiles\(Array\.from\(e\.dataTransfer\.files \|\| \[\]\)\)/);
  assert.match(fs.readFileSync("src/lib/rasterSideFiles.js", "utf8"), /\/\\.\(tiff\?\|gxf\|grd\)\$\/i\.test\(f\.name\)/);
});

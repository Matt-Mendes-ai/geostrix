// TASKS.csv #1507 — a GeoTIFF dropped on the Maps tab's map (not only its raster sidebar) imports.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the Maps map takes dropped files and hands them to the raster import", () => {
  const m = fs.readFileSync("src/modules/MapsModule.jsx", "utf8");
  assert.match(m, /const RASTER_DROP = \/\\.\(tiff\?\|gxf\|grd\)\$\/i;/);
  assert.equal((m.match(/\{\.\.\.mapDrop\}/g) || []).length, 2, "both the plan view and the empty card");
  assert.match(m, /setPane\("raster"\);\s*requestModuleAction\("import-raster-files", \{ files, others \}\);/);
  const r = fs.readFileSync("src/modules/RasterModule.jsx", "utf8");
  assert.match(r, /useModuleAction\(\["import-raster-files"\], \(_a, p\) => \{\s*\(p\?\.files \|\| \[\]\)\.forEach\(\(f\) => importRaster\(f\)\);/);
  // the same extensions as the sidebar's own drop
  assert.match(r, /\/\\.\(tiff\?\|gxf\|grd\)\$\/i\.test\(f\.name\)/);
});

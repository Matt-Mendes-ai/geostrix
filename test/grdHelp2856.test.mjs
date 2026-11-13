// TASKS.csv #2856 (review GSC geophysics) — the Raster drape help said the binary .grd 'isn't supported' in a build that reads Geosoft and Surfer .grd
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("the raster texts name the .grd it reads", () => {
  const r = fs.readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.ok(!r.includes("isn't supported, no public spec"));
  assert.ok(r.includes("a Geosoft .gxf grid, or a Geosoft or Surfer binary .grd grid, as a flat plane"));
  assert.ok(r.includes('tr("Drop GeoTIFF / .gxf / .grd files to import")'));
  assert.ok(r.includes("Pick a georeferenced raster — a GeoTIFF, a Geosoft .gxf grid or a Geosoft / Surfer .grd grid"));
  assert.ok(fs.readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8").includes("Geosoft / Surfer .grd grid and manage the raster drapes"));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    const k = Object.keys(d).find((x) => x.startsWith("Import a georeferenced GeoTIFF (mag/radiometrics") && x.includes("Surfer"));
    assert.ok(k && /Surfer/.test(d[k]) && !/propietario|proprietário|propriétaire|الاحتكاري/.test(d[k]), l);
  }
});

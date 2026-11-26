// TASKS.csv #2856 (review GSC geophysics) — the Raster drape help said the binary .grd 'isn't supported' in a build that reads Geosoft and Surfer .grd
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("the raster texts name the .grd it reads", () => {
  const r = fs.readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.ok(!r.includes("isn't supported, no public spec"));
  // #4087 — the panel's info pop-up went to its Help page (the "?" at the end of the step bar), which names the .grd
  assert.ok(r.includes('helpPage="geotiff-gxf"'));
  assert.ok(fs.readFileSync(new URL("../src/help/pages/maps.js", import.meta.url), "utf8").includes("Geosoft .gxf or Geosoft / Surfer .grd grid as a raster"));
  // #3948: the drop overlay's and the empty card's texts went with RasterModule's own empty card (never shown inside Maps)
  assert.ok(fs.readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8").includes("Geosoft / Surfer .grd grid and manage the raster drapes"));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    const k = Object.keys(d).find((x) => x.startsWith("Import a georeferenced GeoTIFF, Geosoft .gxf") && x.includes("Surfer"));
    assert.ok(k && /Surfer/.test(d[k]) && !/propietario|proprietário|propriétaire|الاحتكاري/.test(d[k]), l);
  }
});

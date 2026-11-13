// TASKS.csv #2295 (review #2174, WA gold) — Shapefile and GeoPackage exports on a project with no CRS: written in its own grid (no .prj /
// the 'undefined Cartesian' SRS) instead of refused; KML still asks
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shapefileZipFiles } from "../src/lib/shapefile.js";
test("#2295 a shapefile with no CRS: no .prj, a READ_ME that says why", () => {
  const files = shapefileZipFiles({ features: [{ geometry: [[32000, 808000, 400]], attributes: { id: "A" } }], geomType: "point", epsg: null, baseName: "x" });
  assert.ok(!files.some((f) => f.name.endsWith(".prj")));
  const rm = files.find((f) => f.name.endsWith("_READ_ME.txt"));
  assert.match(new TextDecoder().decode(rm.data), /project's coordinate system was not chosen/);
});
test("#2295 wiring: Shapefile and GeoPackage skip the CRS question on a no-CRS project; KML does not", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  // #2322 — the same rule through tiedExport.js: a no-CRS project with no tie skips the question (no .prj); a TIED one goes through its tie
  assert.equal((v.match(/ex = project\?\.crsSet === false && !tx\.tieOf\(project\) \? null : await tx\.exportCrs\(project\); if \(!ex && project\?\.crsSet !== false\) return; const epsg = ex\?\.epsg \?\? null;/g) || []).length, 2);
  const kml = v.slice(v.indexOf("const exportVectorKML = async"), v.indexOf("const exportVectorKML = async") + 600);
  assert.match(kml, /ex = await tx\.exportCrs\(project\); if \(!ex\) return; const epsg = ex\.epsg;/); // KML still asks (exportCrs is ensureExportCrs without a tie)
  assert.match(readFileSync(new URL("../src/lib/gpkg.js", import.meta.url), "utf8"), /const srsId = Number\.isFinite\(epsg\) && epsg > 0 \? epsg : -1;/);
});

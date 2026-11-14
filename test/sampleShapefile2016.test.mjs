// TASKS.csv #2016 (review #2013, Import) — a point shapefile of samples dropped on the 3D view reached the Geochem import as the binary
// .shp ('0 elements recognized', NUL column names); Geochem's drop and Surface samples input took .csv / .xlsx only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const p = rd("../src/modules/viewer/importPipelineImpl.js"), g = rd("../src/modules/GeochemModule.jsx"), m = rd("../src/components/SurfaceImportModal.jsx");

test("the 3D view hands a GIS file's parsed rows, headers and CRS to Geochem, a CSV / workbook its File", () => {
  assert.match(p, /const assayHandoffOf = \(file, rows, headers, meta\) => \{[\s\S]{0,300}?return \/\\.\(shp\|zip\|gpkg\|kml\|kmz\)\$\/i\.test\(file\.name\) \|\| meta\?\.vector/); // a block since #2268
  assert.match(p, /\? \{ name: file\.name, parsedTable: \{ headers, rows, sourceEpsg: meta\?\.detectedEpsg \|\| null \} \}/);
  assert.equal((p.match(/assayHandoffRef\.current\.push\(assayHandoffOf\(file, data, headers, meta\)\)/g) || []).length, 2);
});
test("Geochem reads parsed rows, or a GIS file itself; lines / polygons are refused; the .prj CRS pre-fills the dialog", () => {
  assert.match(g, /if \(file\.parsedTable\) return Promise\.resolve\(\{ rows: file\.parsedTable\.rows, headers: file\.parsedTable\.headers, note: "" \}\);/);
  assert.match(g, /if \(!VECTOR_FILE\.test\(file\.name\)\) return parseTableOrWorkbook\(file, elementScore, \{ columnar: true \}\);/);
  assert.match(g, /meta\.vector\.geomType !== "point"\) \{ reject\(new Error\(tr\("it holds lines or polygons, not sample points/);
  assert.match(g, /if \(!sourceEpsg && fileEpsg && crsName\(fileEpsg\)\) \{ sourceEpsg = String\(fileEpsg\); sourceEpsgFrom = OWN_CRS; \}/);
  assert.match(m, /modal\.sourceEpsgFrom === "\(own CRS\)"/);
});
test("Geochem's drop and Surface samples input take shapefiles (grouped with their parts), GeoPackages and KML", () => {
  assert.match(g, /SHP_GROUP\(Array\.from\(e\.dataTransfer\.files \|\| \[\]\)\)\.filter\(\(f\) => f\.name\.toLowerCase\(\)\.endsWith\("\.csv"\) \|\| isXlsxName\(f\.name\) \|\| VECTOR_FILE\.test\(f\.name\)\)/);
  assert.match(g, /accept="\.csv,\.xlsx,\.shp,\.dbf,\.prj,\.cpg,\.shx,\.zip,\.gpkg,\.kml,\.kmz"/);
});

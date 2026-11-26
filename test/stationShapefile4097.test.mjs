// TASKS.csv #4097 — a point shapefile with no hole column (a ground-EM survey's stations, found live in #4056) opened the import dialog, which offered
// "Import as survey stations": that handed the .shp to Geophysics > Point survey, which reads no shapefile, so nothing happened and nothing was said.
// A map file's points now go to Map layers (as Geological Mapping imports them); a station TABLE keeps the Point survey button.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modal = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
const pipe = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");

test("the dialog sends a map file's points to Map layers, and only a table to Point survey", () => {
  const re = modal.match(/const MAP_FILE = (\/.+\/i);/);
  assert.ok(re, "MAP_FILE");
  const [, body, flags] = re[1].match(/^\/(.+)\/(\w*)$/);
  const MAP_FILE = new RegExp(body, flags); // the source's own regex
  for (const n of ["SYN_stations.shp", "survey.zip", "pts.gpkg", "a.kml", "b.kmz", "c.geojson", "d.gpx"]) assert.ok(MAP_FILE.test(n), n);
  for (const n of ["stations.csv", "stations.xlsx", "line.dat", "shp.csv"]) assert.ok(!MAP_FILE.test(n), n);
  assert.match(modal, /modal\.file && MAP_FILE\.test\(modal\.file\.name \|\| ""\) && \(/);
  assert.match(modal, /requestModuleAction\("import-as-map-layer", \{ file \}\)/);
  assert.match(modal, /!MAP_FILE\.test\(modal\.file\.name \|\| ""\) && looksLikeStationTable\(modal\.headers\)/, "a map file never gets the Point survey button");
});

test("the action reaches the pipeline, which adds the points as a map layer", () => {
  assert.match(hook, /useModuleAction\(\["import-as-map-layer"\], \(_a, p\) => \{ if \(p\?\.file\) run\(\(x\) => x\.importAsMapLayer\(p\.file\)\); \}\);/);
  assert.match(pipe, /const importAsMapLayer = \(file\) => parseVectorFile\(file, \(data, err, meta\) => \{\s+if \(meta\?\.vector\) \{ sendToMapLayers\(file, meta\.vector\); return; \}/);
  assert.match(pipe, /return \{ commitImport, handleDrop, importAsMapLayer/);
});

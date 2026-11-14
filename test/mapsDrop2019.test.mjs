// TASKS.csv #2019 (review #2013, Import) — the Maps tab's map took rasters only; the same shapefile could become two identical Map layers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameMapLayer, mapsDropRoutes } from "../src/lib/mapLayerBuild.js";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const maps = rd("../src/modules/MapsModule.jsx"), pipe = rd("../src/modules/viewer/importPipelineImpl.js");

test("a drop on the map: rasters, GIS vectors, tables and the rest", () => {
  assert.deepEqual(mapsDropRoutes(["dem.tif", "ip.shp", "claims.zip", "pts.gpkg", "collars.csv", "wb.xlsx", "notes.docx"]),
    { raster: ["dem.tif"], vector: ["ip.shp", "claims.zip", "pts.gpkg"], table: ["collars.csv", "wb.xlsx"], other: ["notes.docx"] });
});
test("the same layer again is found; another file with the same name but other features is not", () => {
  const ip = { name: "VCU_IP_Lines", sourceName: "VCU_IP_Lines", geomType: "polyline", features: new Array(9).fill({}), bbox: [613000.2, 5781000.4, 615000, 5784400] };
  assert.equal(sameMapLayer([{ ...ip, id: "a" }], { ...ip, bbox: [613000, 5781000, 615000, 5784400] })?.id, "a");
  assert.equal(sameMapLayer([{ ...ip, id: "a" }], { ...ip, features: new Array(10).fill({}) }), null);
  assert.equal(sameMapLayer([{ ...ip, id: "a" }], { ...ip, geomType: "polygon" }), null);
  assert.equal(sameMapLayer([], ip), null);
});
test("wired: Maps adds lines / polygons itself and hands the rest to the 3D view's import; both say a repeat", () => {
  assert.match(maps, /const routes = mapsDropRoutes\(all\.map\(\(f\) => f\.name\)\)/);
  assert.match(maps, /if \(!vec \|\| got\.err \|\| got\.meta\?\.layerOptions \|\| !vec\.geomType \|\| vec\.geomType === "point"\) \{ toViewer\.push\(f\); continue; \}/);
  assert.match(maps, /goToModule\?\.\("viewer"\);\s*requestModuleAction\("import-dropped-files"/);
  // the listener is a hook: it stayed in useImportPipeline.js when the body moved to importPipelineImpl.js (startup split)
  assert.match(readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8"), /useModuleAction\(\["import-dropped-files"\], \(_a, p\) => \{/);
  assert.match(pipe, /const twin = sameMapLayer\(live\.mapLayers, layer\);/);
  assert.match(maps, /const twin = sameMapLayer\(mapLayers, layer\);/);
});

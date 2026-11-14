// TASKS.csv #3474 (from #2901) — a Geosoft .xml / .prj / world file dropped with its raster on the 3D View is paired with it, as the raster pane,
// the Maps plan drop and the Geophysics tab pair them (rasterFileSet): a CRS-less .grd beside its Geosoft .xml no longer reads "no CRS".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupShapefileParts } from "../src/lib/viewer/importHelpers.js";
import { rasterFileSet } from "../src/lib/rasterSideFiles.js";

const f = (name) => ({ name });
// what handleDrop does with the drop, up to the raster imports
function dropPlan(files) {
  const grouped = groupShapefileParts(files);
  const rasterSides = rasterFileSet([...grouped.files, ...grouped.unmatched]);
  const sideUsed = new Set(rasterSides.images.flatMap((i) => [i.world, i.xml, i.prj].filter(Boolean)));
  const unmatched = grouped.unmatched.filter((x) => !sideUsed.has(x));
  return { rasterSides, sideUsed, unmatched, sideInFiles: grouped.files.filter((x) => sideUsed.has(x)).length, direct: grouped.files.filter((x) => /\.(tiff?|gxf|grd)$/i.test(x.name)) };
}

test("a .grd with its Geosoft .xml, a .tif with its world file and .prj: each raster gets its own side files; none is left as 'unrecognized'", () => {
  const p = dropPlan([f("mag.grd"), f("mag.xml"), f("rad.tif"), f("rad.tfw"), f("rad.prj"), f("lone.xml")]);
  const by = Object.fromEntries(p.rasterSides.images.map((i) => [i.file.name, i]));
  assert.equal(by["mag.grd"].xml.name, "mag.xml");
  assert.equal(by["rad.tif"].world.name, "rad.tfw");
  assert.equal(by["rad.tif"].prj.name, "rad.prj");
  assert.deepEqual(p.unmatched.map((x) => x.name), ["lone.xml"], "only the side file with no raster stays unmatched");
  assert.equal(p.sideInFiles, 1, "the world file travelled in the file list (not a shapefile sidecar): it is not counted as skipped");
  assert.equal(p.direct.length, 2);
});

test("a shapefile's own .prj / .xml are not taken for a raster's", () => {
  const p = dropPlan([f("zones.shp"), f("zones.dbf"), f("zones.prj"), f("zones.shp.xml"), f("dem.tif")]);
  assert.equal(p.rasterSides.images.length, 1);
  assert.equal(p.rasterSides.images[0].prj, null);
  assert.equal(p.rasterSides.images[0].xml, null);
  assert.equal(p.sideUsed.size, 0);
});

test("wiring: handleDrop pairs the side files and passes them to the raster import, which reads them as the Geophysics tab does", () => {
  const s = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const importBrowserFile = async \(file, filePath, side = \{\}\) =>/);
  assert.match(s, /else await importBrowserFile\(f, undefined, sideOf\(f\)\);/);
  assert.match(s, /const rasterSides = rasterFileSet\(\[\.\.\.grouped\.files, \.\.\.grouped\.unmatched\]\);/);
  assert.match(s, /grouped\.unmatched = grouped\.unmatched\.filter\(\(f\) => !sideUsed\.has\(f\)\);/);
  assert.match(s, /- sideInFiles \/\* #2901: read with their raster \*\//);
  assert.match(s, /const worldFile = side\.world \? rasterLib\.parseWorldFile\(await side\.world\.text\(\), side\.world\.name\) : null;/);
  assert.match(s, /const xc = side\.xml \? geosoftXmlCrs\(await side\.xml\.text\(\)\) : null;/);
  assert.match(s, /const pe = !xc && side\.prj \? guessEpsgFromPrjWkt\(await side\.prj\.text\(\)\) : null;/);
  assert.match(s, /tie: tieOf\(live\.project \|\| project\)[^\n]*, worldFile, sideCrs \}\);/);
});

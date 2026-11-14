// TASKS.csv #2901 (split from #2830) — a Geosoft .xml / .prj / world file dropped with its raster on the Geophysics tab is paired as the raster pane's picker pairs it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rasterFileSet } from "../src/lib/rasterSideFiles.js";
const f = (name) => ({ name });
test("the side files of a drop go with the raster of the same name", () => {
  const s = rasterFileSet([f("mag.grd"), f("mag.xml"), f("rad.tif"), f("rad.tfw"), f("rad.prj"), f("lone.xml")]);
  const by = Object.fromEntries(s.images.map((i) => [i.file.name, i]));
  assert.equal(by["mag.grd"].xml.name, "mag.xml");
  assert.equal(by["rad.tif"].world.name, "rad.tfw");
  assert.equal(by["rad.tif"].prj.name, "rad.prj");
  assert.deepEqual(s.orphans.map((x) => x.name), ["lone.xml"]);
});
test("the Geophysics drop reads them and passes them on, and does not name them as not imported", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /buildRasterImport\(file, \{[^\n]*tie: tieOf\(project\), worldFile, sideCrs \}\)/);
  assert.match(g, /gxfs\.forEach\(\(gxf\) => importRaster\(gxf, sideOf\(gxf\)\)\);/);
  assert.match(g, /const other = files\.filter\(\(f\) => !sideUsed\.has\(f\) && /);
});

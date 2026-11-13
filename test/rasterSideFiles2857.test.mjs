// TASKS.csv #2857 / #2854 (review GSC geophysics) — (2857) a .prj beside a world file was read as a bad TIFF, not offered in the dialog, and a
// drop set the world file aside; an unused world file was not said. (2854) an ECW got a different, unfitting message on each drop route.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rasterFileSet } from "../src/lib/rasterSideFiles.js";
import { mapsDropRoutes } from "../src/lib/mapLayerBuild.js";
import { unreadableFormatAdvice } from "../src/lib/unreadableFormats.js";
const f = (name) => ({ name });

test("#2857 each raster with its world file, .xml and .prj", () => {
  const s = rasterFileSet([f("FlinFlon_res.TIF"), f("FlinFlon_res.tfw"), f("FlinFlon_res.prj"), f("Athabasca.grd"), f("Athabasca.grd.xml"), f("lonely.prj"), f("x.ECW")]);
  assert.equal(s.images.length, 2);
  const t = s.images.find((i) => i.file.name === "FlinFlon_res.TIF");
  assert.equal(t.world.name, "FlinFlon_res.tfw"); assert.equal(t.prj.name, "FlinFlon_res.prj"); assert.equal(t.xml, null);
  assert.equal(s.images.find((i) => i.file.name === "Athabasca.grd").xml.name, "Athabasca.grd.xml");
  assert.deepEqual(s.orphans.map((x) => x.name), ["lonely.prj"]);
  assert.deepEqual(s.unreadable.map((x) => x.name), ["x.ECW"]);
  assert.ok(rasterFileSet([f("a.tif"), f("a.tif.prj")]).images[0].prj, "'a.tif.prj' too");
});

test("#2857 the plan routes a raster's side files with it", () => {
  const r = mapsDropRoutes(["m.TIF", "m.tfw", "m.prj", "roads.prj", "notes.tfw"]);
  assert.deepEqual(r.raster, ["m.TIF", "m.tfw", "m.prj"]);
  assert.deepEqual(r.other, ["roads.prj", "notes.tfw"]);
  const m = fs.readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8");
  assert.ok(m.includes("const side = grouped0.unmatched.filter((f) => /\\.(prj|xml)$/i.test(f.name))"));
});

test("#2857 the importer: the .prj's CRS, the dialog offers .prj, an unused world file is said", () => {
  const r = fs.readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.ok(r.includes('accept=".tif,.tiff,.gxf,.grd,.tfw,.tifw,.tiffw,.wld,.xml,.prj"'));
  assert.ok(r.includes("const pe = !xc && prj && !sourceEpsg ? guessEpsgFromPrjWkt(await prj.text()) : null;"));
  assert.ok(r.includes("const importRasterFiles = (all, notes = []) => {")); assert.equal((r.match(/importRasterFiles\(/g) || []).length, 3, "used by the dialog, the sidebar drop and the plan drop");
  const l = fs.readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.ok(l.includes("worldUnused = { name: worldFile.name, offM: off };") && l.includes("was not used: the TIFF's own georeferencing placed it"));
});

test("#2854 an ECW is told the way out", () => {
  for (const n of ["FlinFlon_SnowLake_25m_mag_vd1.ECW", "a.sid", "b.jp2"]) assert.match(unreadableFormatAdvice(n), /convert it to a GeoTIFF first/, n);
  assert.equal(unreadableFormatAdvice("a.tif"), null);
});

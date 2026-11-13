// TASKS.csv #3107 — the Mount Raymond sample (Geological Survey of Canada, Canadian Geoscience Map 71; Open Government Licence - Canada):
// the map's four layers read, its planar measurements read and are turned to grid north, the terrain covers them, and the sample is offered.
import test from "node:test";
import assert from "node:assert/strict";
import { raymondMeasurements, loadMountRaymond, RAYMOND_FILES, RAYMOND_LAYERS, RAYMOND_EPSG, RAYMOND_SET } from "../src/lib/sampleMountRaymond.js";
import { parseShapefileParts } from "../src/lib/shapefile.js";
import { read, exists, table, folderBytes, tiff, fileOf, said, checkOffered } from "./sampleChecks3107.mjs";

const dir = "mount_raymond";
const layer = (base) => parseShapefileParts({ shp: new Uint8Array(read(dir, `${base}.shp`)), dbf: new Uint8Array(read(dir, `${base}.dbf`)), cpg: "UTF-8" });

test("the folder is small and holds the files the loader names", () => {
  assert.ok(folderBytes(dir) < 0.8e6, `${folderBytes(dir)} bytes`);
  for (const f of RAYMOND_FILES) assert.ok(exists(dir, f), f);
});

test("the four map layers read with their descriptive columns, in the map's own CRS, and carry no name columns", () => {
  const counts = {};
  for (const L of RAYMOND_LAYERS) {
    const p = layer(L.base);
    counts[L.base] = p.features.length;
    assert.ok(p.features.every((f) => L.field in f.attributes && !("AUTHORITY" in f.attributes) && !("REFERENCE" in f.attributes)), L.base);
    assert.match(read(dir, `${L.base}.prj`).toString("utf8"), /NAD_1983_UTM_Zone_8N/);
  }
  assert.deepEqual(counts, { map_units: 31, faults: 20, folds: 29, contacts: 71 });
  assert.equal(new Set(layer("map_units").features.map((f) => f.attributes.MAP_UNIT)).size, 15);
  assert.equal(layer("map_units").geomType, "polygon");
});

test("the 119 planar measurements read (114 bedding, 7 overturned) and every one sits on the terrain", async () => {
  const m = raymondMeasurements(read(dir, "bedding.csv").toString("utf8"));
  assert.deepEqual([m.rows.length, m.skipped, m.rows.filter((r) => r.cls === "bedding").length], [119, 0, 114]);
  assert.ok(m.rows.every((r) => r.x > 432000 && r.x < 456000 && r.y > 7348000 && r.y < 7377000 && r.dip >= 0 && r.dip <= 90));
  assert.equal(table(dir, "bedding.csv").filter((r) => /overturned/.test(r.attitude)).length, 7);
  const { img, data } = await tiff(dir, "terrain_cdem_90m.tif");
  assert.deepEqual([img.getWidth(), img.getHeight(), img.getResolution()[0]], [267, 328, 90]);
  let lo = Infinity, hi = -Infinity;
  for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  assert.ok(lo > 340 && lo < 360 && hi > 1150 && hi < 1175, `${lo} to ${hi} m`);
  const [x0, y0, x1, y1] = img.getBoundingBox();
  assert.ok(m.rows.every((r) => r.x > x0 && r.x < x1 && r.y > y0 && r.y < y1));
});

test("the loader adds the layers draped on the terrain and the measurements turned from true to grid north", async () => {
  const got = { layers: [], sets: [], terrains: [] };
  const notes = await loadMountRaymond(fileOf(dir), { addMapLayer: (l) => got.layers.push(l), addSurfaceStructureSet: (s) => got.sets.push(s), addTerrain: (t) => got.terrains.push(t) }, { projectEpsg: RAYMOND_EPSG });
  assert.deepEqual(got.layers.map((l) => l.features.length), [31, 20, 29, 71]);
  assert.deepEqual(got.layers.map((l) => [l.styleField, l.visible, l.drapeMode]), [["MAP_UNIT", true, "terrain"], ["SUBFEATURE", true, "terrain"], ["SUBFEATURE", true, "terrain"], ["SUBFEATURE", false, "terrain"]]);
  assert.deepEqual([got.sets.length, got.sets[0].name, got.sets[0].rows.length, got.sets[0].azimuthRef], [1, RAYMOND_SET, 119, "true"]);
  // every dip direction turned by the grid convergence at its station (0.9 to 1.4 degrees across the sheet), none left as read
  const m = raymondMeasurements(read(dir, "bedding.csv").toString("utf8"));
  const turned = got.sets[0].rows.map((r, i) => (((r.dipDir - m.rows[i].dipDir) % 360) + 360) % 360);
  assert.ok(turned.every((d) => d > 0.9 && d < 1.4), `${Math.min(...turned)} to ${Math.max(...turned)}`);
  assert.match(said(notes), /Loaded the Mount Raymond sample.*4 map layer\(s\), 119 planar measurement\(s\)/);
  // the terrain is read by the app's raster reader: here it either loads or says by itself that it could not
  if (got.terrains.length) assert.deepEqual([got.terrains[0].gridW > 200, got.terrains[0].source.sourcePixelM], [true, 90]);
  else assert.match(said(notes), /The Mount Raymond terrain could not be loaded/);
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "OGL-Canada-2.0", who: /Geological Survey of Canada/, name: "Mount Raymond mapping (sample)", inFootnote: "Mount Raymond (Geological Survey of Canada" });
});

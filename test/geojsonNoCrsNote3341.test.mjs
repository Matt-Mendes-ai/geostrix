// TASKS.csv #3341 (Galore Creek review) — a GeoJSON boundary in project metres with no 'crs' member was taken as the project CRS (its numbers
// are not degrees, #1757) while the import said 'its longitude / latitude (WGS 84) was reprojected to the project's NAD83 / UTM zone 9N'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGeoJSON, layersToBoundaryPolylines } from "../src/lib/gpxGeojson.js";

const poly = (ring, crs) => JSON.stringify({ type: "FeatureCollection", ...(crs ? { crs: { type: "name", properties: { name: crs } } } : {}), features: [{ type: "Feature", properties: { name: "SYNTH claim" }, geometry: { type: "Polygon", coordinates: [ring] } }] });
const utm = [[350500, 6333500], [351500, 6333500], [351500, 6334500], [350500, 6334500], [350500, 6333500]];

test("a GeoJSON in metres with no 'crs' is read as not degrees and kept at its own numbers", () => {
  const gj = parseGeoJSON(poly(utm));
  assert.equal(gj.notDegrees, true);
  assert.equal(gj.epsg, null);
  const r = layersToBoundaryPolylines(gj.layers, 26909, () => { throw new Error("nothing is reprojected"); });
  assert.deepEqual(r.polylines[0][0], { x: 350500, y: 6333500 });
});

test("a 'crs' member naming a code and a plain lon / lat file are told apart", () => {
  assert.equal(parseGeoJSON(poly(utm, "urn:ogc:def:crs:EPSG::26909")).epsg, 26909);
  const ll = parseGeoJSON(poly([[-131.4, 57.1], [-131.3, 57.1], [-131.3, 57.2], [-131.4, 57.1]]));
  assert.equal(ll.epsg, 4326);
  assert.equal(!!ll.notDegrees, false);
});

test("the boundary import words its note from what was done", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /if \(gj\?\.notDegrees\) \{\n        const placed = await plainSourceTransform\(\);/);
  assert.match(g, /tr\("the file names no CRS and its coordinates are not degrees: they were taken as the project's \{dst\}, check where it lies \(or choose its Source CRS in the pane and import it again\)"/);
  assert.match(g, /tr\("its 'crs' member names EPSG:\{src\}: read in it and reprojected to the project's \{dst\}"/);
});

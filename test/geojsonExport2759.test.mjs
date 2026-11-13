// TASKS.csv #2759 — map layers, boundaries and samples export as GeoJSON (RFC 7946, WGS 84) beside KML.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { featuresToGeoJson } from "../src/lib/geojsonExport.js";

const toLonLat = (x, y) => [x / 1000, y / 1000]; // a stand-in transform: metres -> "degrees"
const area2 = (ring) => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return a; };

test("points keep their attributes, a name and colour when given, z when known", () => {
  const { text, count } = featuresToGeoJson({ geomType: "point", features: [{ geometry: [[1000, 2000, 350.123]], attributes: { sample: "S1", Cu: 120, blank: "" } }, { geometry: [] }] }, { toLonLat, nameOf: () => "S1", colorOf: () => "#ff0000" });
  const fc = JSON.parse(text);
  assert.equal(fc.type, "FeatureCollection");
  assert.equal(count, 1, "a feature with no geometry is left out");
  assert.deepEqual(fc.features[0].geometry, { type: "Point", coordinates: [1, 2, 350.12] });
  assert.deepEqual(fc.features[0].properties, { sample: "S1", Cu: 120, name: "S1", stroke: "#ff0000" });
});

test("lines: one part a LineString, several a MultiLineString", () => {
  const one = JSON.parse(featuresToGeoJson({ geomType: "polyline", features: [{ geometry: [[0, 0], [1000, 0]] }] }, { toLonLat }).text).features[0].geometry;
  assert.deepEqual(one, { type: "LineString", coordinates: [[0, 0], [1, 0]] });
  const multi = JSON.parse(featuresToGeoJson({ geomType: "polyline", features: [{ geometry: [], parts: [[[0, 0], [1000, 0]], [[0, 1000], [1000, 1000]]] }] }, { toLonLat }).text).features[0].geometry;
  assert.equal(multi.type, "MultiLineString");
  assert.equal(multi.coordinates.length, 2);
});

test("polygons: closed rings, the outer counter-clockwise and a hole clockwise (RFC 7946), however they were drawn", () => {
  const outerCw = [[0, 0], [0, 10000], [10000, 10000], [10000, 0]]; // clockwise as drawn
  const holeCcw = [[4000, 4000], [6000, 4000], [6000, 6000], [4000, 6000]];
  const g = JSON.parse(featuresToGeoJson({ geomType: "polygon", features: [{ geometry: outerCw, parts: [outerCw, holeCcw], attributes: { name: "Claim 1" } }] }, { toLonLat }).text).features[0].geometry;
  assert.equal(g.type, "Polygon");
  assert.equal(g.coordinates.length, 2);
  const [outer, hole] = g.coordinates;
  assert.deepEqual(outer[0], outer[outer.length - 1]);
  assert.ok(area2(outer) > 0, "outer counter-clockwise");
  assert.ok(area2(hole) < 0, "hole clockwise");
});

test("wiring: the overlay export menu offers GeoJSON beside KML, through the same WGS 84 transform", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{ label: tr\("Export GeoJSON \(WGS 84\)…"\), onClick: async \(\) => exportVectorKML\(label, await build\(\), typeof kml === "function" \? await kml\(\) : kml, true\) \}/);
  assert.match(v, /\(await import\("\.\.\/lib\/geojsonExport\.js"\)\)\.featuresToGeoJson\(built, \{ toLonLat, \.\.\.kmlOpts \}\)/);
});

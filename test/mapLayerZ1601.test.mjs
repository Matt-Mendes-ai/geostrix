// TASKS.csv #1601 — map-layer points and lines keep their own elevations and can be drawn at them
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeoJSON, gpxToLayers } from "../src/lib/gpxGeojson.js";
import { normalizeMapLayer } from "../src/lib/mapLayers.js";
import { mapLayerAtOwnZ } from "../src/lib/viewer/sceneBuilders.js";
import { parseKML, kmlToMapLayers } from "../src/lib/kml.js";
import { shapefileZipFiles, parseShapefileParts } from "../src/lib/shapefile.js";

test("GeoJSON points and lines keep their third coordinate", () => {
  const gj = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { lith: "QFP" }, geometry: { type: "Point", coordinates: [604800, 6357600, 1225.4] } },
    { type: "Feature", properties: { lith: "AND" }, geometry: { type: "Point", coordinates: [604900, 6357700] } },
    { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[604800, 6357600, 1300], [604900, 6357700, 1320]] } },
  ] };
  const { layers } = parseGeoJSON(gj);
  const pts = layers.find((l) => l.geomType === "point");
  assert.deepEqual(pts.features[0].parts[0][0], [604800, 6357600, 1225.4]);
  assert.deepEqual(pts.features[1].parts[0][0], [604900, 6357700]);
  const n = normalizeMapLayer(pts);
  assert.equal(n.hasZ, true); assert.deepEqual(n.features[0].parts[0][0], [604800, 6357600, 1225.4]); assert.equal(n.features[1].parts[0][0].length, 2);
});

test("GPX elevations survive normalising (waypoints and track points)", () => {
  const layers = gpxToLayers({ waypoints: [{ lon: -127, lat: 57, ele: 1500, name: "W1" }], lines: [{ name: "t", points: [{ lon: -127, lat: 57, ele: 1400 }, { lon: -127.001, lat: 57.001, ele: 1410 }] }] });
  const w = normalizeMapLayer(layers[0]), t = normalizeMapLayer(layers[1]);
  assert.equal(w.features[0].parts[0][0][2], 1500);
  assert.deepEqual(t.features[0].parts[0].map((p) => p[2]), [1400, 1410]);
  assert.equal(normalizeMapLayer({ geomType: "polygon", features: [{ parts: [[[0, 0], [1, 0], [1, 1]]] }] }).hasZ, undefined, "no Z, no flag");
});

test("drawn at their own Z (a vertex without one at the layer's Elev.), category colours, hidden categories left out", () => {
  const l = { geomType: "point", hasZ: true, elevation: 1834, styleField: "lith", categories: [{ value: "QFP", color: "#ff0000", visible: true }, { value: "AND", color: "#00ff00", visible: false }],
    features: [{ parts: [[[100, 200, 1225]]], attributes: { lith: "QFP" } }, { parts: [[[110, 210]]], attributes: { lith: "QFP" } }, { parts: [[[120, 220, 1300]]], attributes: { lith: "AND" } }] };
  const obj = mapLayerAtOwnZ(l, { x: 100, y: 200, z: 1000 });
  const p = obj.geometry.attributes.position.array;
  assert.equal(p.length, 6, "two shown points");
  assert.deepEqual([...p.slice(0, 3)], [0, 225, -0]); assert.equal(p[4], 834);
  assert.equal(obj.isPoints, true);
  const line = mapLayerAtOwnZ({ geomType: "polyline", hasZ: true, features: [{ parts: [[[0, 0, 10], [1, 1, 20], [2, 2, 30]]], attributes: {} }] }, { x: 0, y: 0, z: 0 });
  assert.equal(line.isLineSegments, true); assert.equal(line.geometry.attributes.position.count, 4);
});

import { buildLayer } from "../src/lib/mapLayerBuild.js";
test("buildLayer passes hasZ on", () => {
  const { layers } = parseGeoJSON({ type: "FeatureCollection", features: [{ type: "Feature", properties: { a: 1 }, geometry: { type: "Point", coordinates: [381835, 5956308, 830] } }] });
  const l = buildLayer({ ...layers[0], epsg: null }, { sourceName: "stations", projectEpsg: 26910 });
  assert.equal(l.hasZ, true);
});

test("KML: an absolute altitude is kept, a clamped one (the KML default) is not", () => {
  const kml = `<kml><Document>
    <Placemark><name>A</name><Point><altitudeMode>absolute</altitudeMode><coordinates>-127.1,57.2,1488</coordinates></Point></Placemark>
    <Placemark><name>B</name><Point><coordinates>-127.2,57.3,0</coordinates></Point></Placemark>
    <Placemark><name>T</name><LineString><altitudeMode>absolute</altitudeMode><coordinates>-127.1,57.2,1400 -127.11,57.21,1420</coordinates></LineString></Placemark>
  </Document></kml>`;
  const layers = kmlToMapLayers(parseKML(kml).features);
  const pts = layers.find((l) => l.geomType === "point"), line = layers.find((l) => l.geomType !== "point");
  assert.deepEqual(pts.features[0].parts[0][0], [-127.1, 57.2, 1488]);
  assert.deepEqual(pts.features[1].parts[0][0], [-127.2, 57.3], "clampToGround: the 0 is not an elevation");
  assert.deepEqual(line.features[0].parts[0].map((p) => p[2]), [1400, 1420]);
});

test("all-zero Z (2D shapefile / GeoPackage shapes read as z = 0) is no elevation; one real Z keeps the zeros", () => {
  const flat = normalizeMapLayer({ geomType: "point", features: [{ parts: [[[1, 2, 0]]] }, { parts: [[[3, 4, 0]]] }] });
  assert.equal(flat.hasZ, undefined);
  assert.deepEqual(flat.features[0].parts[0][0], [1, 2]);
  const coast = normalizeMapLayer({ geomType: "point", features: [{ parts: [[[1, 2, 0]]] }, { parts: [[[3, 4, 12]]] }] });
  assert.equal(coast.hasZ, true);
  assert.deepEqual(coast.features[0].parts[0][0], [1, 2, 0]);
});

test("shapefile: PointZ elevations reach the map layer, a 2D Point file does not get a Z", () => {
  const feats = [{ geometry: [[604800, 6357600, 1225.4]], attributes: { id: "S1" } }, { geometry: [[604900, 6357700, 1846]], attributes: { id: "S2" } }];
  const read = (flat) => { const files = shapefileZipFiles({ features: feats, geomType: "point", baseName: "st", flat }); const by = Object.fromEntries(files.map((f) => [f.name, f.data])); return parseShapefileParts({ shp: by["st.shp"], dbf: by["st.dbf"] }); };
  const z = normalizeMapLayer(read(false)), flat = normalizeMapLayer(read(true));
  assert.equal(z.hasZ, true); assert.deepEqual(z.features.map((f) => f.parts[0][0][2]), [1225.4, 1846]);
  assert.equal(flat.hasZ, undefined); assert.equal(flat.features[0].parts[0][0].length, 2);
});

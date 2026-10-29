// TASKS.csv #1106 — GPX (waypoints, tracks, routes) and GeoJSON read into map layers and boundary polylines
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGPX, gpxToLayers, parseGeoJSON, layersToBoundaryPolylines } from "../src/lib/gpxGeojson.js";
import { planGpx } from "../src/lib/surveyPlan.js";

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="52.30" lon="-121.30"><ele>1100.5</ele><time>2026-07-02T17:00:00Z</time><name>SL-001</name><desc>soil, B horizon &amp; wet</desc><sym>Flag</sym></wpt>
  <wpt lat="52.31" lon="-121.31"><name>SL-002</name></wpt>
  <wpt lat="95" lon="0"><name>bad</name></wpt>
  <trk><name>Traverse 1</name><trkseg>
    <trkpt lat="52.30" lon="-121.30"><ele>1100</ele><time>2026-07-02T17:00:00Z</time></trkpt>
    <trkpt lat="52.305" lon="-121.305"/>
    <trkpt lat="52.31" lon="-121.31"><time>2026-07-02T18:00:00Z</time></trkpt>
  </trkseg><trkseg><trkpt lat="52.4" lon="-121.4"/><trkpt lat="52.41" lon="-121.41"/></trkseg></trk>
  <rte><name>Access</name><rtept lat="52.2" lon="-121.2"/><rtept lat="52.21" lon="-121.21"/></rte>
</gpx>`;

test("GPX: waypoints with their fields, every track segment and route as a line", () => {
  const g = parseGPX(GPX);
  assert.equal(g.waypoints.length, 2);
  assert.equal(g.skipped, 1); // the out-of-range waypoint
  assert.deepEqual(g.waypoints[0], { lon: -121.3, lat: 52.3, ele: 1100.5, name: "SL-001", desc: "soil, B horizon & wet", time: "2026-07-02T17:00:00Z", sym: "Flag", type: "" });
  assert.deepEqual(g.lines.map((l) => [l.kind, l.name, l.points.length]), [["track", "Traverse 1", 3], ["track", "Traverse 1", 2], ["route", "Access", 2]]);
  const [w, t] = gpxToLayers(g);
  assert.equal(w.geomType, "point"); assert.equal(w.epsg, 4326);
  assert.deepEqual(w.features[0].parts, [[[-121.3, 52.3]]]);
  assert.equal(w.features[1].attributes.name, "SL-002");
  assert.equal(w.features[1].attributes.ele, undefined); // empty fields left out
  assert.equal(t.geomType, "polyline");
  assert.deepEqual(t.features[0].attributes, { name: "Traverse 1", kind: "track", points: 3, start: "2026-07-02T17:00:00Z", end: "2026-07-02T18:00:00Z" });
  assert.throws(() => parseGPX("<kml></kml>"), /not GPX/);
});

test("a survey plan GPX written by GeoStrix reads back: its stations as waypoints, its soil lines as tracks", () => {
  const sites = [0, 1, 2].map((i) => ({ x: i * 25, y: 0, line: 0, station: i * 25, name: `L0+${i * 25}` }));
  const rows = sites.map((_, i) => ({ site: i, kind: "sample", sample_id: `S${i + 1}` }));
  const g = parseGPX(planGpx(rows, sites, (x, y) => [-121 + x / 1e5, 52 + y / 1e5], "plan"));
  assert.deepEqual(g.waypoints.map((w) => w.name), ["S1", "S2", "S3"]);
  assert.deepEqual(g.lines.map((l) => [l.name, l.points.length]), [["Line +0", 3]]);
});

test("GeoJSON: features split by kind, Multi* and collections, properties as attributes, the crs member honoured", () => {
  const fc = { type: "FeatureCollection", features: [
    { type: "Feature", id: 7, properties: { claim: "1012345", owner: { nested: 1 } }, geometry: { type: "Polygon", coordinates: [[[-121, 52], [-121.1, 52], [-121.1, 52.1], [-121, 52]]] } },
    { type: "Feature", properties: { name: "a" }, geometry: { type: "MultiPoint", coordinates: [[-121, 52], [-121.2, 52.2]] } },
    { type: "Feature", properties: {}, geometry: { type: "GeometryCollection", geometries: [{ type: "LineString", coordinates: [[0, 0], [1, 1]] }, { type: "Point", coordinates: [3, 3] }] } },
    { type: "Feature", properties: {}, geometry: null },
  ] };
  const r = parseGeoJSON(JSON.stringify(fc));
  assert.equal(r.epsg, 4326);
  assert.deepEqual(r.layers.map((l) => [l.geomType, l.features.length]), [["point", 3], ["polyline", 1], ["polygon", 1]]);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.layers[2].features[0].attributes, { claim: "1012345", id: 7 }); // nested objects dropped
  assert.equal(parseGeoJSON({ type: "Point", coordinates: [500000, 6000000], crs: undefined }).layers[0].geomType, "point");
  assert.equal(parseGeoJSON({ type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::26910" } }, features: [] }).epsg, 26910);
  assert.throws(() => parseGeoJSON("{nope"), /not valid GeoJSON/);
});

test("boundary polylines: lines and rings reprojected, points left out", () => {
  const r = parseGeoJSON({ type: "FeatureCollection", features: [
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [9, 9] } }] });
  const fake = (x, y, from, to) => (from === 4326 && to === 32610 ? { x: x * 10, y: y * 10 } : null);
  const { polylines, failed } = layersToBoundaryPolylines(r.layers, 32610, fake);
  assert.equal(failed, 0);
  assert.deepEqual(polylines, [[{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }, { x: 10, y: 20 }]]);
});

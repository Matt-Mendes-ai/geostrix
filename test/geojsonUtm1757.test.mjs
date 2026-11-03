// TASKS.csv #1757 (review #1645, Copley) — a GeoJSON in UTM with no "crs" member is not read as degrees
import test from "node:test";
import assert from "node:assert/strict";
import { parseGeoJSON, layersToBoundaryPolylines } from "../src/lib/gpxGeojson.js";

const utm = { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "claim" }, geometry: { type: "Polygon", coordinates: [[[381000, 5955000], [383000, 5955000], [383000, 5957000], [381000, 5955000]]] } }] };

test("coordinates beyond +-180 / +-90: no EPSG (the project CRS), flagged", () => {
  const r = parseGeoJSON(JSON.stringify(utm));
  assert.equal(r.notDegrees, true);
  assert.equal(r.layers[0].epsg, null);
});

test("as boundary polylines they stay where they are in the project CRS (no degree reprojection)", () => {
  const { polylines } = layersToBoundaryPolylines(parseGeoJSON(utm).layers, 26910, () => { throw new Error("should not reproject"); });
  assert.deepEqual(polylines[0][0], { x: 381000, y: 5955000 });
});

test("a real lon / lat file is unchanged", () => {
  const ll = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-124.79, 53.74] } };
  const r = parseGeoJSON(ll);
  assert.equal(r.epsg, 4326);
  assert.equal(r.notDegrees, false);
});

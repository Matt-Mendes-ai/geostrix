// TASKS.csv #1767 — a GeoJSON boundary kept its file extension as its name ('copley_outlines_26910.geojson') and its features' names were
// dropped: claim block, two prospect outlines and a road became one boundary of 4 unnamed parts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { featureLabel, fileStem, vectorToBoundaryPolylines } from "../src/lib/boundaryImport.js";
import { parseGeoJSON, layersToBoundaryPolylines } from "../src/lib/gpxGeojson.js";
import { reprojectXY } from "../src/lib/reproject.js";

test("the file stem names the boundary", () => {
  assert.equal(fileStem("copley_outlines_26910.geojson"), "copley_outlines_26910");
  assert.equal(fileStem("claims.v2.zip"), "claims.v2");
  assert.equal(fileStem("noext"), "noext");
});

test("a feature's name comes from a name / label / title property", () => {
  assert.equal(featureLabel({ name: "North Dome", kind: "prospect" }), "North Dome");
  assert.equal(featureLabel({ NAME: "Claim block" }), "Claim block");
  assert.equal(featureLabel({ Label: " East Dome " }), "East Dome");
  assert.equal(featureLabel({ kind: "road" }), "");
  assert.equal(featureLabel({ name: "" , title: "Haul road" }), "Haul road");
  assert.equal(featureLabel(null), "");
});

test("GeoJSON and shapefile boundaries keep a name per part", async () => {
  const gj = { type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:26910" } }, features: [
    { type: "Feature", properties: { name: "Claim block", kind: "claim" }, geometry: { type: "Polygon", coordinates: [[[600000, 5800000], [601000, 5800000], [601000, 5801000], [600000, 5800000]]] } },
    { type: "Feature", properties: { name: "North Dome", kind: "prospect" }, geometry: { type: "Polygon", coordinates: [[[600100, 5800100], [600200, 5800100], [600200, 5800200], [600100, 5800100]]] } },
    { type: "Feature", properties: { kind: "road" }, geometry: { type: "LineString", coordinates: [[600000, 5800500], [601000, 5800500]] } },
  ] };
  const r = layersToBoundaryPolylines(parseGeoJSON(JSON.stringify(gj)).layers, 26910, reprojectXY);
  assert.equal(r.polylines.length, 3);
  assert.deepEqual([...r.partNames].sort(), ["", "Claim block", "North Dome"]);
  const shp = await vectorToBoundaryPolylines({ epsg: 26910, geomType: "polygon", features: [{ parts: [[[0, 0], [1, 0], [1, 1]], [[2, 2], [3, 2], [3, 3]]], attributes: { NAME: "Lot 7" } }, { parts: [[[5, 5], [6, 5], [6, 6]]], attributes: {} }] }, 26910);
  assert.deepEqual(shp.partNames, ["Lot 7", "Lot 7", ""]);
  const none = await vectorToBoundaryPolylines({ epsg: 26910, geomType: "polygon", features: [{ parts: [[[0, 0], [1, 0], [1, 1]]], attributes: { ID: 3 } }] }, 26910);
  assert.equal(none.partNames, undefined);
});

test("Boundaries names by the stem and shows the parts' names", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /addBoundary\(\{ name: fileStem\(file\.name\), polylines,/);
  assert.match(src, /addBoundary\(\{ name: `\$\{fileStem\(file\.name\)\}: \$\{p\.table\}`/);
  assert.match(src, /tr\("Parts: \{names\}"/);
});

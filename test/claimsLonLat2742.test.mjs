// TASKS.csv #2742 (split from #2466) — a GeoJSON / GPX / KML tenement file gives one claim per feature (a KML: per Placemark) with its tenure
// number, status and expiry date, as a shapefile does (#1970 / #2466). SYNTHETIC tenements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGeoJSON, layersToBoundaryPolylines } from "../src/lib/gpxGeojson.js";
import { parseKML, kmlToProjectPolylines } from "../src/lib/kml.js";
import { claimsFromVector } from "../src/lib/boundaryImport.js";

const sq = (x, y, d = 0.01) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];
const noReproject = (x, y) => ({ x, y });

test("GeoJSON: three tenements, one a two-part multipolygon -> three claims with their numbers, status and expiry", () => {
  const gj = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { TENID: "E 29/1001", TENSTATUS: "LIVE", ENDDATE: "2027-03-31" }, geometry: { type: "Polygon", coordinates: [sq(121.0, -29.0)] } },
    { type: "Feature", properties: { TENID: "E 29/1002", TENSTATUS: "PENDING" }, geometry: { type: "MultiPolygon", coordinates: [[sq(121.1, -29.0)], [sq(121.2, -29.0)]] } },
    { type: "Feature", properties: { TENID: "P 29/9", TENSTATUS: "DEAD" }, geometry: { type: "Polygon", coordinates: [sq(121.3, -29.0)] } },
  ] };
  const { layers } = parseGeoJSON(JSON.stringify(gj));
  const r = layersToBoundaryPolylines(layers, null, noReproject);
  assert.equal(r.polylines.length, 4);
  assert.deepEqual(r.featureOf, [0, 1, 1, 2]);
  assert.equal(r.attributes.length, 3);
  const claims = claimsFromVector(r, "tenements", 300);
  assert.deepEqual(claims.map((c) => [c.name, c.tenureNumber, c.status, c.polylines.length]), [
    ["tenements E 29/1001", "E 29/1001", "active", 1], ["tenements E 29/1002", "E 29/1002", "pending", 2], ["tenements P 29/9", "P 29/9", "expired", 1]]);
  assert.equal(claims[0].expiryDate, "2027-03-31");
});

test("KML: one claim per Placemark (a MultiGeometry's polygons stay one claim), its name and ExtendedData read", () => {
  const pm = (name, data, polys) => `<Placemark><name>${name}</name><ExtendedData>${Object.entries(data).map(([k, v]) => `<Data name="${k}"><value>${v}</value></Data>`).join("")}</ExtendedData>${polys.length > 1 ? "<MultiGeometry>" : ""}${polys.map((p) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${p.map(([x, y]) => `${x},${y}`).join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join("")}${polys.length > 1 ? "</MultiGeometry>" : ""}</Placemark>`;
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${pm("North block", { TENEMENT: "M 15/77", STATUS: "Granted" }, [sq(121.0, -30.0), sq(121.05, -30.0)])}${pm("South block", { TENEMENT: "M 15/78", STATUS: "Application" }, [sq(121.0, -30.1)])}</Document></kml>`;
  const { features } = parseKML(kml);
  const r = kmlToProjectPolylines(features, null);
  assert.equal(r.polylines.length, 3);
  assert.deepEqual(r.featureOf, [0, 0, 1]);
  assert.deepEqual(r.closedFlags, [true, true, true]);
  assert.equal(r.attributes[0].name, "North block");
  const claims = claimsFromVector(r, "leases", 300);
  assert.deepEqual(claims.map((c) => [c.name, c.tenureNumber, c.polylines.length]), [["leases North block", "M 15/77", 2], ["leases South block", "M 15/78", 1]]);
});

test("a file with one feature still gives one claim named after the file, with its attributes (#2466's rule)", () => {
  const { layers } = parseGeoJSON(JSON.stringify({ type: "Feature", properties: { TENID: "E 29/1001", TENSTATUS: "LIVE" }, geometry: { type: "Polygon", coordinates: [sq(121.0, -29.0)] } }));
  const c = claimsFromVector(layersToBoundaryPolylines(layers, null, noReproject), "E29-1001", 300);
  assert.deepEqual(c.map((x) => [x.name, x.tenureNumber, x.status]), [["E29-1001", "E 29/1001", "active"]]);
});

test("the Claims / Boundaries routes pass featureOf and attributes for KML and GeoJSON / GPX", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /return \{ polylines, featureOf, attributes, note: withLonLatSource\(lonLatNote\(tie\)\) \};/);
  assert.match(src, /return \{ polylines, closedFlags, featureOf, attributes, \.\.\.\(partNames \? \{ partNames \} : \{\}\), note:/);
});

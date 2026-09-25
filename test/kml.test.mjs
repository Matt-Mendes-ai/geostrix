// TASKS.csv #424 — KML / KMZ import (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { parseKML, parseKMZ, kmlToProjectPolylines, kmlFeaturesToRows } from "../src/lib/kml.js";

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
 <Placemark><name>Tenure 1087654</name><description><![CDATA[<b>Owner</b>: Test &amp; Co]]></description>
  <ExtendedData><SchemaData schemaUrl="#s"><SimpleData name="TENURE_NUMBER">1087654</SimpleData><SimpleData name="STATUS">GOOD</SimpleData></SchemaData></ExtendedData>
  <MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>
   -129.60,55.73,0 -129.58,55.73,0 -129.58,55.74,0 -129.60,55.74,0 -129.60,55.73,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark>
 <Placemark><name>WP 12 &lt;gossan&gt;</name><ExtendedData><Data name="note"><value>rusty outcrop</value></Data></ExtendedData>
  <Point><coordinates>-129.595,55.735,1180</coordinates></Point></Placemark>
 <Placemark><name>Road</name><kml:LineString><kml:coordinates>-129.61,55.72 -129.59,55.725</kml:coordinates></kml:LineString></Placemark>
 <Placemark><name>No geometry</name></Placemark>
</Document></kml>`;

test("#424 parseKML reads points, lines, polygons (MultiGeometry), names, CDATA and ExtendedData", () => {
  const { features, skipped } = parseKML(KML);
  assert.equal(skipped, 1);
  assert.deepEqual(features.map((f) => f.geomType), ["polygon", "point", "line"]);
  assert.equal(features[0].attrs.TENURE_NUMBER, "1087654");
  assert.match(features[0].description, /Owner : Test & Co|Owner: Test & Co/);
  assert.equal(features[1].name, "WP 12 <gossan>");
  assert.deepEqual(features[1].coords[0], [-129.595, 55.735, 1180]);
  assert.equal(features[1].attrs.note, "rusty outcrop");
  assert.equal(features[2].coords.length, 2); // prefixed kml: tags
});

test("#424 KML is reprojected from WGS84 to the project CRS for boundaries; rows keep lon/lat", () => {
  const { features } = parseKML(KML);
  const { polylines, failed } = kmlToProjectPolylines(features, 3156);
  assert.equal(failed, 0);
  assert.equal(polylines.length, 2); // polygon + line; the point is not a boundary
  const p = polylines[0][0];
  assert.ok(p.x > 455000 && p.x < 475000 && p.y > 6170000 && p.y < 6185000, `${p.x},${p.y}`);
  const { rows } = kmlFeaturesToRows(features);
  const wp = rows.find((r) => r.name === "WP 12 <gossan>");
  assert.equal(wp.x, -129.595); assert.equal(wp.z, 1180); assert.equal(wp.note, "rusty outcrop");
  assert.equal(rows.filter((r) => r.part === 1).length, 5);
});

test("#424 KMZ (zipped doc.kml) is read", async () => {
  const name = Buffer.from("doc.kml"), data = Buffer.from(KML), comp = zlib.deflateRawSync(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, name, comp]); const central = Buffer.concat([cd, name]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(body.length, 16);
  const { features } = await parseKMZ(new Uint8Array(Buffer.concat([body, central, eocd])));
  assert.equal(features.length, 3);
});

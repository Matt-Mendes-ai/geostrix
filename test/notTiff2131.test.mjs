// TASKS.csv #2131 — a CSV fed to GeoTIFF / GXF said 'Not a readable GeoTIFF (Invalid byte order value.)', with no file name
import test from "node:test";
import assert from "node:assert/strict";
import { isTiffHeader, parseGeoTIFF } from "../src/lib/raster.js";

test("TIFF and BigTIFF headers, both byte orders", () => {
  assert.equal(isTiffHeader(Uint8Array.from([0x49, 0x49, 0x2a, 0])), true);
  assert.equal(isTiffHeader(Uint8Array.from([0x4d, 0x4d, 0, 0x2a])), true);
  assert.equal(isTiffHeader(Uint8Array.from([0x49, 0x49, 0x2b, 0])), true);
  assert.equal(isTiffHeader(new TextEncoder().encode("Samp")), false);
  assert.equal(isTiffHeader(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), false); // a PNG
  assert.equal(isTiffHeader(new Uint8Array(2)), false);
});

test("a table and another file are named and sent where they belong", async () => {
  const csv = new File(["Sample,X,Y,Cu\n1,2,3,4\n"], "2024 Soil Samples.csv");
  await assert.rejects(parseGeoTIFF(csv), /"2024 Soil Samples\.csv" is not a TIFF, \.gxf or \.grd: a table goes to Geochem \(surface samples\) or the 3D View/);
  const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "map.tif");
  await assert.rejects(parseGeoTIFF(png), /"map\.tif" is not a TIFF, \.gxf or \.grd file \(its first bytes are not a TIFF header\)/);
});

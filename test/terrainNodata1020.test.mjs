// TASKS.csv #1020 (review #1016) — the terrain GeoTIFF writes the filled no-data nodes as no-data, not as the mean fill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromArrayBuffer } from "geotiff";
import { terrainToGeoTIFFArrayBuffer } from "../src/lib/raster.js";

test("#1020 masked (filled) terrain nodes come back as GDAL_NODATA; real ones keep their elevation", async () => {
  const gridW = 5, gridH = 4, n = gridW * gridH;
  const elevations = Array.from({ length: n }, (_, i) => 1000 + i);
  const filled = [6, 7, 8, 11, 12, 13];
  const bits = new Uint8Array(Math.ceil(n / 8));
  for (const i of filled) { bits[i >> 3] |= 1 << (i & 7); elevations[i] = 1009.5; }
  const noDataMask = Buffer.from(bits).toString("base64");
  const terrain = { bbox: [500000, 6000000, 500400, 6000300], gridW, gridH, elevations, noDataMask };
  const buf = terrainToGeoTIFFArrayBuffer(terrain, 32610);
  assert.equal(terrainToGeoTIFFArrayBuffer.lastMasked, 6);
  const img = await (await fromArrayBuffer(buf)).getImage();
  assert.equal(img.getGDALNoData(), -9999);
  const [band] = await img.readRasters();
  for (let i = 0; i < n; i++) assert.equal(band[i], filled.includes(i) ? -9999 : 1000 + i, `node ${i}`);
  // the mask as bytes works too, and no mask leaves every node as written
  terrainToGeoTIFFArrayBuffer({ ...terrain, noDataMask: bits }, 32610);
  assert.equal(terrainToGeoTIFFArrayBuffer.lastMasked, 6);
  terrainToGeoTIFFArrayBuffer({ ...terrain, noDataMask: null }, 32610);
  assert.equal(terrainToGeoTIFFArrayBuffer.lastMasked, 0);
});

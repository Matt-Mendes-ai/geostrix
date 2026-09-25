// TASKS.csv #420 — terrain GeoTIFF export/import registration (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { fromArrayBuffer } from "geotiff";
import { terrainToGeoTIFFArrayBuffer, demNodeBbox } from "../src/lib/raster.js";

test("#420 terrain GeoTIFF: pixel centres are the grid nodes, and it re-imports to the same nodes", async () => {
  const gridW = 11, gridH = 6, bbox = [400000, 6200000, 401000, 6200500]; // 100 m node spacing
  const elevations = new Float32Array(gridW * gridH).map((_, i) => 1000 + i);
  const buf = terrainToGeoTIFFArrayBuffer({ bbox, gridW, gridH, elevations }, 3156);
  const img = await (await fromArrayBuffer(buf)).getImage();
  const [rx, ry] = img.getResolution();
  assert.ok(Math.abs(rx - 100) < 1e-6 && Math.abs(Math.abs(ry) - 100) < 1e-6, `resolution ${rx},${ry}`);
  const [ox, oy] = img.getOrigin();
  assert.ok(Math.abs(ox + rx / 2 - bbox[0]) < 1e-6 && Math.abs(oy - Math.abs(ry) / 2 - bbox[3]) < 1e-6, "first pixel centre = first node");
  const back = demNodeBbox(img);
  back.forEach((v, i) => assert.ok(Math.abs(v - bbox[i]) < 1e-6, `bbox[${i}] ${v} vs ${bbox[i]}`));
  const band = (await img.readRasters())[0];
  assert.equal(band[0], 1000); assert.equal(band[gridW * gridH - 1], 1000 + gridW * gridH - 1);
});

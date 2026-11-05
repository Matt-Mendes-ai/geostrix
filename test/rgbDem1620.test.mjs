// TASKS.csv #1620 — a colour picture is not imported as a terrain; a new terrain is checked against the collars
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeArrayBuffer } from "geotiff";
import { parseDEMFiles } from "../src/lib/raster.js";
import { collarTerrainOffset } from "../src/lib/terrainCheck.js";

const geo = (S, bits, format, extra = {}) => ({ width: 8, height: 6, SamplesPerPixel: S, PlanarConfiguration: 1, BitsPerSample: Array(S).fill(bits), SampleFormat: Array(S).fill(format),
  ModelPixelScale: [10, 10, 0], ModelTiepoint: [0, 0, 0, 500000, 6000000, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 26909, ...extra });

test("an 8-bit RGB picture is refused with a way forward; a float DEM is read", async () => {
  const rgb = new File([await writeArrayBuffer(new Uint8Array(8 * 6 * 3).fill(255), geo(3, 8, 1, { PhotometricInterpretation: 2 }))], "Resdepthslice-20m.tif");
  await assert.rejects(parseDEMFiles([rgb], 26909), /colour picture \(3 band\(s\) of 8 bits\).*GeoTIFF \/ GXF/);
  const dem = new File([await writeArrayBuffer(Float32Array.from({ length: 48 }, (_, i) => 1500 + i), geo(1, 32, 3))], "dem.tif");
  const r = await parseDEMFiles([dem], 26909);
  assert.ok(r.elevations.length > 0 && Math.max(...r.elevations) > 1500);
});

test("collars a median far above the terrain are measured", () => {
  const t = { bbox: [0, 0, 100, 100], gridW: 2, gridH: 2, elevations: Float32Array.from([100, 100, 100, 100]) };
  const r = collarTerrainOffset([{ x: 10, y: 10, z: 1600 }, { x: 50, y: 50, z: 1650 }, { x: 90, y: 90, z: 1700 }, { x: 500, y: 500, z: 0 }], t);
  assert.equal(r.n, 3); assert.equal(r.median, 1550);
  assert.equal(collarTerrainOffset([{ x: 10, y: 10, z: 1 }], t), null);
});

// TASKS.csv #560 — PixelIsPoint rasters placed by their pixel centres; rotated GeoTIFFs refused instead of stretched.
import test from "node:test";
import assert from "node:assert/strict";
import { writeArrayBuffer, fromArrayBuffer } from "geotiff";
import { rasterAreaBbox, demNodeBbox, assertNorthUp, tiffTag } from "../src/lib/raster.js";

const make = async (extra) => (await fromArrayBuffer(await writeArrayBuffer(new Float32Array(12).fill(1), { width: 4, height: 3, ModelPixelScale: [25, 25, 0], ModelTiepoint: [0, 0, 0, 500000, 6000000, 0], GeographicTypeGeoKey: 4326, ...extra }))).getImage();

test("#560 PixelIsArea: extent = the tie point corner; nodes = pixel centres", async () => {
  const img = await make({ GTRasterTypeGeoKey: 1 });
  assert.deepEqual(rasterAreaBbox(img), [500000, 5999925, 500100, 6000000]);
  assert.deepEqual(demNodeBbox(img), [500012.5, 5999937.5, 500087.5, 5999987.5]);
});

test("#560 PixelIsPoint: the tie point IS the first pixel centre (extent half a pixel out from it)", async () => {
  const img = await make({ GTRasterTypeGeoKey: 2 });
  const area = rasterAreaBbox(img);
  assert.deepEqual(area, [499987.5, 5999937.5, 500087.5, 6000012.5]);
  const nodes = demNodeBbox(img);
  assert.equal(nodes[0], 500000); // first node x = tie point x
  assert.equal(nodes[3], 6000000); // first node y = tie point y
  // the image drape's nodes (area + half a pixel) agree with the DEM path's nodes
  assert.deepEqual([area[0] + 12.5, area[1] + 12.5, area[2] - 12.5, area[3] - 12.5], nodes);
});

test("#560 a rotated GeoTIFF is refused with what to do", async () => {
  const img = await make({ ModelTransformation: [24, 5, 0, 500000, 5, -24, 0, 6000000, 0, 0, 0, 0, 0, 0, 0, 1] });
  assert.ok(tiffTag(img, "ModelTransformation"));
  assert.throws(() => assertNorthUp(img), /rotated or sheared.*Warp it north-up/);
  assert.throws(() => demNodeBbox(img), /rotated or sheared/);
  assert.doesNotThrow(async () => assertNorthUp(await make({})));
});

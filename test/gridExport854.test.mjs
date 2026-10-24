// TASKS.csv #854 — value grids as GeoTIFF: read back with geotiff.js, the values, the no-data cells, the georeferencing
// (cell centres on the values, row 0 north) and the EPSG geokey
import test from "node:test";
import assert from "node:assert/strict";
import { fromArrayBuffer } from "geotiff";
import { gridToGeoTIFF, gridValues, nodeGridGeometry, safeFileName, GEOTIFF_NODATA } from "../src/lib/gridExport.js";
import { f32ToB64 } from "../src/lib/inversion.js";

test("#854 a two-band grid round-trips with its georeferencing and no-data", async () => {
  const nx = 4, ny = 3;
  const a = Float32Array.from([1, 2, 3, 4, 5, NaN, 7, 8, 9, 10, 11, 12]);
  const b = Float32Array.from({ length: 12 }, (_, i) => i * 0.5);
  const buf = gridToGeoTIFF({ nx, ny, x0: 500010, yTop: 6200020, dx: 20, dy: 10, bands: [{ values: a }, { values: f32ToB64(b) }], epsg: 26909 });
  const tiff = await fromArrayBuffer(buf), img = await tiff.getImage();
  assert.equal(img.getWidth(), nx); assert.equal(img.getHeight(), ny); assert.equal(img.getSamplesPerPixel(), 2);
  const [r0, r1] = await img.readRasters();
  assert.deepEqual(Array.from(r0), [1, 2, 3, 4, 5, GEOTIFF_NODATA, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(Array.from(r1), Array.from(b));
  assert.equal(img.getGDALNoData(), GEOTIFF_NODATA);
  // outer corners: the first cell's centre is (500010, 6200020), cells 20 x 10
  assert.deepEqual(img.getBoundingBox(), [500000, 6200020 + 5 - 30, 500080, 6200025]);
  assert.equal(img.getGeoKeys().ProjectedCSTypeGeoKey, 26909);
  assert.equal(img.getGeoKeys().GTRasterTypeGeoKey, 1);
});

test("#854 helpers: values from any form, node grids, file names, a size mismatch refused", () => {
  assert.deepEqual(Array.from(gridValues([1, 2])), [1, 2]);
  assert.deepEqual(Array.from(gridValues(f32ToB64([3, 4]))), [3, 4]);
  assert.deepEqual(nodeGridGeometry({ bbox: [0, 0, 100, 50], gridW: 11, gridH: 6 }), { nx: 11, ny: 6, x0: 0, yTop: 50, dx: 10, dy: 10 });
  assert.equal(safeFileName("Catchments: Cu in stream sediment (90th percentile)"), "Catchments_Cu_in_stream_sediment_90th_percentile");
  assert.throws(() => gridToGeoTIFF({ nx: 2, ny: 2, x0: 0, yTop: 0, dx: 1, dy: 1, bands: [{ values: [1, 2, 3] }] }), /3 values for 2 x 2/);
});

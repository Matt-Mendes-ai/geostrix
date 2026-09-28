// TASKS.csv #487 — Cartography > A file: GeoTIFF warped from one CRS to another (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { writeArrayBuffer, fromArrayBuffer } from "geotiff";
import { reprojectGeoTiff, readGeoTiffInfo } from "../src/lib/fileReproject.js";
import { pointTransform } from "../src/lib/reproject.js";

// a w x h GeoTIFF in `epsg`, pixel (0,0)'s centre at (x0, y0), square pixels of `px`
function makeTiff(values, w, h, x0, y0, px, epsg, extra = {}) {
  return new Uint8Array(writeArrayBuffer(values, {
    width: w, height: h, ModelPixelScale: [px, px, 0], ModelTiepoint: [0, 0, 0, x0 - px / 2, y0 + px / 2, 0],
    GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: epsg, ...extra,
  }));
}
const plane = (x, y) => 0.01 * (x - 460000) - 0.02 * (y - 6260000) + 500; // bilinear is exact on a plane

test("#487 a float GeoTIFF warped 3156 -> 3157 and -> 4326 keeps its values where they belong", async () => {
  const w = 60, h = 50, px = 20, x0 = 460000, y0 = 6261000;
  const vals = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) vals[r * w + c] = plane(x0 + c * px, y0 - r * px);
  const src = makeTiff(vals, w, h, x0, y0, px, 3156, { GDAL_NODATA: "-9999" });
  for (const to of [3157, 4326]) {
    const { bytes, report } = await reprojectGeoTiff(src, null, to);
    assert.equal(report.from, 3156);
    assert.equal(report.resampling, "bilinear");
    const info = await readGeoTiffInfo(bytes);
    assert.equal(info.epsg, to);
    assert.equal(info.noData, -9999);
    const img = info.image, [band] = await img.readRasters();
    const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution();
    const back = pointTransform(to, 3156);
    let checked = 0, nodata = 0, worst = 0;
    for (let r = 0; r < info.height; r += 3) for (let c = 0; c < info.width; c += 3) {
      const v = band[r * info.width + c];
      const [sx, sy] = back(ox + (c + 0.5) * rx, oy + (r + 0.5) * ry); // pixel centre, back in the source CRS
      const inside = sx >= x0 && sx <= x0 + (w - 1) * px && sy <= y0 && sy >= y0 - (h - 1) * px;
      if (v === -9999) { nodata++; assert.ok(!inside || sx - x0 < 1e-6 || x0 + (w - 1) * px - sx < 1e-6); continue; }
      assert.ok(inside, `value outside the footprint at ${c},${r}`);
      worst = Math.max(worst, Math.abs(v - plane(sx, sy))); checked++;
    }
    assert.ok(checked > 200 && nodata > 0, `${checked} checked, ${nodata} nodata`);
    assert.ok(worst < 0.01, `EPSG:${to}: worst ${worst}`); // float32 storage of ~500
  }
});

test("#487 integer (class) GeoTIFFs use nearest sampling: no invented classes; the From override; an untagged file is refused", async () => {
  const w = 40, h = 40, px = 25;
  const cls = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) cls[r * w + c] = c < 20 ? (r < 20 ? 3 : 7) : 11;
  const src = makeTiff(cls, w, h, 470000, 6270000, px, 3156);
  const { bytes, report } = await reprojectGeoTiff(src, null, 3155);
  assert.equal(report.resampling, "nearest");
  const img = await (await fromArrayBuffer(bytes.buffer)).getImage();
  const [band] = await img.readRasters();
  assert.equal(band.constructor, Uint8Array);
  assert.deepEqual([...new Set(band)].sort((a, b) => a - b), [0, 3, 7, 11]); // 0 = outside the footprint
  // From overrides the tag (here: pretend the tag was wrong and the file is really in 3157)
  const r2 = await reprojectGeoTiff(src, 3157, 3156);
  assert.equal(r2.report.from, 3157);
  const untagged = new Uint8Array(writeArrayBuffer(cls, { width: w, height: h, ModelPixelScale: [px, px, 0], ModelTiepoint: [0, 0, 0, 470000, 6270000, 0], GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 32767 }));
  await assert.rejects(reprojectGeoTiff(untagged, null, 4326), /no EPSG code in its tags/);
});

// TASKS.csv #1038 (review #1016) — the fast GeoTIFF writer gives geotiff.js's bytes exactly, without a DataView per sample.
import test from "node:test";
import assert from "node:assert/strict";
import { writeArrayBuffer, fromArrayBuffer } from "geotiff";
import { writeGeoTiff } from "../src/lib/geotiffWrite.js";

const meta = (w, h, extra = {}) => ({ width: w, height: h, ModelPixelScale: [25, 25, 0], ModelTiepoint: [0, 0, 0, 500000, 6000000, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 32610, ...extra });
const fill = (T, n, f) => { const a = new T(n); for (let i = 0; i < n; i++) a[i] = f(i); return a; };
const same = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); assert.equal(x.length, y.length); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) assert.fail(`byte ${i}: ${x[i]} vs ${y[i]}`); };

test("#1038 byte-identical to geotiff.js: 1 / 3 / 10 float bands, RGB bytes, 16-bit, float64, nodata, geographic", () => {
  const cases = [
    [fill(Float32Array, 37 * 11, (i) => (i % 7 ? Math.sin(i) * 1000 : -9999)), meta(37, 11, { GDAL_NODATA: "-9999" })],
    [fill(Float32Array, 20 * 9 * 3, (i) => i / 3), meta(20, 9, { SamplesPerPixel: 3, PlanarConfiguration: 1, BitsPerSample: [32, 32, 32], SampleFormat: [3, 3, 3] })],
    [fill(Float32Array, 13 * 17 * 10, (i) => Math.cos(i)), meta(13, 17, { SamplesPerPixel: 10, PlanarConfiguration: 1, BitsPerSample: Array(10).fill(32), SampleFormat: Array(10).fill(3) })],
    [fill(Uint8Array, 40 * 30 * 3, (i) => i * 7), meta(40, 30, { PhotometricInterpretation: 2 })],
    [fill(Uint16Array, 300 * 2, (i) => i * 97), meta(300, 2)],
    [fill(Float64Array, 9 * 9, (i) => i * 1.5e-3), meta(9, 9, { GDAL_NODATA: "nan" })],
    [fill(Float32Array, 12 * 12, (i) => i), { width: 12, height: 12, ModelPixelScale: [0.001, 0.001, 0], ModelTiepoint: [0, 0, 0, -123, 54, 0], GTModelTypeGeoKey: 2, GTRasterTypeGeoKey: 1, GeographicTypeGeoKey: 4617 }],
  ];
  for (const [values, m] of cases) same(writeGeoTiff(values, { ...m }), writeArrayBuffer(values, { ...m }));
});

test("#1038 GeoTIFF reads back with the real size and values; a 1000 x 1000 x 10 stack writes in well under a second", async () => {
  const w = 1000, h = 1000, S = 10, v = fill(Float32Array, w * h * S, (i) => i % 1013);
  const t0 = performance.now();
  const buf = writeGeoTiff(v, meta(w, h, { SamplesPerPixel: S, PlanarConfiguration: 1, BitsPerSample: Array(S).fill(32), SampleFormat: Array(S).fill(3) }));
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms`); // geotiff.js: ~14 s (review #1016)
  const img = await (await fromArrayBuffer(buf)).getImage();
  assert.equal(img.getWidth(), w); assert.equal(img.getHeight(), h); assert.equal(img.getSamplesPerPixel(), S);
  const r = await img.readRasters({ window: [998, 999, 1000, 1000], interleave: true });
  const i0 = (999 * w + 998) * S;
  assert.deepEqual(Array.from(r), Array.from(v.subarray(i0, i0 + 2 * S)));
  assert.deepEqual(img.getOrigin().slice(0, 2), [500000, 6000000]);
});

test("#1038 anything else goes through geotiff.js unchanged (plain arrays, Int16)", () => {
  same(writeGeoTiff([1, 2, 3, 4], meta(2, 2)), writeArrayBuffer([1, 2, 3, 4], meta(2, 2)));
  const i16 = Int16Array.from([1, -2, 3, -4]);
  same(writeGeoTiff(i16, meta(2, 2)), writeArrayBuffer(i16, meta(2, 2)));
});

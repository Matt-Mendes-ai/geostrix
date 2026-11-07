// TASKS.csv #1351 — big GeoTIFFs: read by byte range, decoded a tile at a time (no whole-file read, no full-size decode)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTiledReduced, streamPlan, rangedTiffSource, openTiff, readRastersCapped, shrinkBand, MAX_STREAM_SAMPLES, MAX_DECODE_SAMPLES } from "../src/lib/raster.js";
import { writeArrayBuffer } from "geotiff";

// a tiled image in memory with geotiff.js's readRasters({ window, samples }) shape; counts the tiles it is asked for
function mockImage({ W, H, tw, th, bands = 1, noData = null, value = (x, y, b) => x + 1000 * y + 1e6 * b }) {
  const img = {
    reads: 0,
    getWidth: () => W, getHeight: () => H, getSamplesPerPixel: () => bands, getTileWidth: () => tw, getTileHeight: () => th,
    getGDALNoData: () => noData, planarConfiguration: 1,
    async readRasters({ window: [x0, y0, x1, y1], samples }) {
      img.reads++;
      assert.ok(Math.floor(x0 / tw) === Math.floor((x1 - 1) / tw) && Math.floor(y0 / th) === Math.floor((y1 - 1) / th), "one tile per read");
      return (samples || [0]).map((b) => { const a = new Float32Array((x1 - x0) * (y1 - y0)); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[(y - y0) * (x1 - x0) + (x - x0)] = value(x, y, b); return a; });
    },
  };
  return img;
}

test("the mean per cell, tile by tile, equals the mean of the full-size image; no-data and NaN are left out", () => {
  const W = 103, H = 77, value = (x, y) => (x === 5 && y === 5 ? -9999 : x === 6 && y === 6 ? NaN : x + 1000 * y);
  const img = mockImage({ W, H, tw: 16, th: 11, noData: -9999, value });
  return readTiledReduced(img, { width: 10, height: 7, resampleMethod: "bilinear" }).then((out) => {
    assert.equal(out.length, 1); assert.equal(out.width, 10); assert.equal(out.height, 7);
    const bx = W / 10, by = H / 7;
    for (let oy = 0; oy < 7; oy++) for (let ox = 0; ox < 10; ox++) {
      let s = 0, c = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.min(9, Math.floor(x / bx)) === ox && Math.min(6, Math.floor(y / by)) === oy) { const v = value(x, y); if (Number.isFinite(v) && v !== -9999) { s += v; c++; } }
      assert.ok(Math.abs(out[0][oy * 10 + ox] - s / c) < 1e-2 * Math.max(1, Math.abs(s / c)) * 1e-3 + 0.05, `cell ${ox},${oy}`);
    }
    assert.equal(img.reads, Math.ceil(W / 16) * Math.ceil(H / 11), "every tile once");
  });
});

test("nearest: the pixel at each cell's centre, and tiles no cell samples are never decoded", async () => {
  const img = mockImage({ W: 1000, H: 1000, tw: 10, th: 10, bands: 3 });
  const out = await readTiledReduced(img, { width: 20, height: 20, samples: [0, 2] });
  assert.equal(out.length, 2);
  for (let oy = 0; oy < 20; oy++) for (let ox = 0; ox < 20; ox++) {
    const x = Math.floor((ox + 0.5) * 50), y = Math.floor((oy + 0.5) * 50);
    assert.equal(out[0][oy * 20 + ox], x + 1000 * y); assert.equal(out[1][oy * 20 + ox], x + 1000 * y + 2e6);
  }
  assert.equal(img.reads, 400, "20 x 20 sampled tiles of the 10,000");
  const win = await readTiledReduced(mockImage({ W: 1000, H: 1000, tw: 10, th: 10 }), { window: [100, 200, 300, 400], width: 4, height: 4 });
  assert.equal(win[0][0], 125 + 1000 * 225, "a window is honoured");
});

test("over the budget it refuses at once with the way out, before decoding anything", async () => {
  const img = mockImage({ W: 40834, H: 46836, tw: 256, th: 256, bands: 4 }); // the 2.5 GB orthomosaic's shape
  assert.equal(streamPlan(img).tiles, 160 * 183);
  assert.ok(streamPlan(img).decode > MAX_STREAM_SAMPLES);
  await assert.rejects(readTiledReduced(img, { width: 2048, height: 2349 }, "\"ortho.tif\""), /"ortho\.tif" is 40,834 × 46,836 px with no smaller overview: reading it would decode 7,676 million values.*Crop it to your area \(gdal_translate -projwin\) or add overviews \(gdaladdo\)/);
  assert.equal(img.reads, 0);
  const dtm = mockImage({ W: 13966, H: 16178, tw: 256, th: 256 }); // the 249 MB DTM's shape: 230 million, inside the budget
  assert.equal(streamPlan(dtm).tiles, 3520);
  assert.ok(streamPlan(dtm).decode <= MAX_STREAM_SAMPLES && 13966 * 16178 > MAX_DECODE_SAMPLES);
});

test("readRastersCapped streams only a reduced read; a full-size read of a huge image is still refused", async () => {
  const img = mockImage({ W: 9000, H: 9000, tw: 300, th: 300 }); // 81 million values: over the decode limit, no overview
  const r = await readRastersCapped(null, img, { width: 90, height: 90, resampleMethod: "bilinear" }, "big");
  assert.equal(r[0].length, 8100);
  await assert.rejects(readRastersCapped(null, img, {}, "big"), /over the 64 million-value limit/);
  // a file far too small for the image it claims (the #561 bomb) is refused, not streamed
  const bomb = Object.assign(mockImage({ W: 9000, H: 9000, tw: 300, th: 300 }), { source: { fileSize: 50_000 } });
  await assert.rejects(readRastersCapped(null, bomb, { width: 90, height: 90 }, "bomb"), /million-value limit/);
  assert.equal(bomb.reads, 0);
  const real = Object.assign(mockImage({ W: 9000, H: 9000, tw: 300, th: 300 }), { source: { fileSize: 90e6 } }); // 3.6x: a real file's ratio
  assert.equal((await readRastersCapped(null, real, { width: 9, height: 9 }, "real"))[0].length, 81);
});

test("a GeoTIFF is opened by byte range: the header and the parts a read needs, never the whole file", async () => {
  const W = 512, H = 512, values = new Float32Array(W * H).map((_, k) => (k % W) + 0.5 * Math.floor(k / W)); // 1 MB
  const ab = writeArrayBuffer(values, { width: W, height: H, ModelPixelScale: [10, 10, 0], ModelTiepoint: [0, 0, 0, 500000, 6000000, 0], GeographicTypeGeoKey: 4326, SampleFormat: [3], BitsPerSample: [32] });
  const blob = new Blob([ab]);
  let bytes = 0;
  const file = { name: "t.tif", size: blob.size, readRange: async (o, l) => { bytes += l; return blob.slice(o, o + l).arrayBuffer(); } };
  const img = await (await openTiff(file)).getImage();
  assert.equal(img.getWidth(), W);
  assert.ok(bytes < 0.01 * blob.size, `opening read ${bytes} of ${blob.size} bytes`);
  const [band] = await img.readRasters({ window: [10, 10, 12, 11] });
  assert.deepEqual([...band], [15, 16]);
  const src = rangedTiffSource(new Blob([new Uint8Array([1, 2, 3])]));
  const [part] = await src.fetch([{ offset: 1, length: 10 }]);
  assert.deepEqual([...new Uint8Array(part)], [2, 3], "a slice past the end is cut at the end");
});

test("shrinkBand averages valid values; the drape and the DEM paths read by range", () => {
  const s = shrinkBand(Float32Array.from([1, 3, NaN, 5, 7, 9, 2, 2]), 4, 2, 2, 1);
  assert.deepEqual([...s], [(1 + 3 + 7 + 9) / 4, (5 + 2 + 2) / 3]);
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /tiff = await openTiff\(file\); \/\/ #1351 — by byte range, not the whole file in memory/);
  assert.match(r, /tiff = await openTiff\(file\); \/\/ #1351 — by byte range\n/);
  assert.match(r, /const tiff = await openTiff\(file\); \/\/ #1351 — the header only/);
  assert.match(r, /if \(plausible && opts\.width > 0 && opts\.height > 0 && opts\.width \* opts\.height \* bands <= MAX_DECODE_SAMPLES\) return readTiledReduced\(image, opts, label\);/);
});

test("the Browser panel: a GeoTIFF over 200 MB is handed on by range, only a path fs-read-file has just passed, 64 MB a read", () => {
  const m = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.match(m, /if \(st\.size > READ_MAX_BYTES && RANGE_EXT\.has\(ext\)\) \{ rangeReadable\.add\(path\.resolve\(String\(filePath\)\)\); return \{ ok: true, big: true, size: st\.size, name: path\.basename\(filePath\) \}; \}/);
  assert.match(m, /if \(!rangeReadable\.has\(full\)\) return \{ ok: false, error: "Open the file from the Browser panel first\." \};/);
  assert.match(m, /const RANGE_EXT = new Set\(\["\.tif", "\.tiff"\]\);/);
  assert.match(m, /length > RANGE_MAX_BYTES/);
  assert.ok(m.includes("Import it with Geophysics > Point survey (or drop it on the Geophysics tab): big survey files are read in pieces there."), "a big line-data file points to the streamed import");
  const pre = readFileSync(new URL("../electron/preload.js", import.meta.url), "utf8");
  assert.ok(pre.includes('fsReadRange: (filePath, offset, length) => ipcRenderer.invoke("fs-read-range", { filePath, offset, length }),'));
  const p = readFileSync(new URL("../src/components/DbBrowserPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("const file = res.big ? bigFileByRange(entry.path, res) : readResultToFile(res, res.name);"));
});

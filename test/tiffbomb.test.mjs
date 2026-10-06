// TASKS.csv #561 — GeoTIFF decompression bomb: a tiny tiled TIFF claiming a huge size must be refused before
// geotiff.js decodes it at native size (it used to take 22.6 s and ~800 MB for a 49 KB file at 20,000 px).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { fromArrayBuffer } from "geotiff";
import { readRastersCapped, MAX_DECODE_SAMPLES } from "../src/lib/raster.js";

function bombTiff(W, H = W, T = 256) {
  const tile = zlib.deflateSync(Buffer.alloc(T * T));
  const tx = Math.ceil(W / T), ty = Math.ceil(H / T), n = tx * ty;
  const entries = 12, ifdOff = 8, ifdSize = 2 + entries * 12 + 4;
  let p = ifdOff + ifdSize;
  const offArr = p; p += n * 4; const cntArr = p; p += n * 4;
  const scaleOff = p; p += 24; const tieOff = p; p += 48; const tileOff = p; p += tile.length;
  const buf = Buffer.alloc(p);
  buf.write("II", 0); buf.writeUInt16LE(42, 2); buf.writeUInt32LE(ifdOff, 4);
  const E = [[256, 4, 1, W], [257, 4, 1, H], [258, 3, 1, 8], [259, 3, 1, 8], [262, 3, 1, 1], [277, 3, 1, 1],
    [322, 3, 1, T], [323, 3, 1, T], [324, 4, n, offArr], [325, 4, n, cntArr], [33550, 12, 3, scaleOff], [33922, 12, 6, tieOff]];
  buf.writeUInt16LE(entries, ifdOff);
  E.forEach(([tag, type, cnt, val], i) => { const o = ifdOff + 2 + i * 12; buf.writeUInt16LE(tag, o); buf.writeUInt16LE(type, o + 2); buf.writeUInt32LE(cnt, o + 4); if (type === 3 && cnt === 1) buf.writeUInt16LE(val, o + 8); else buf.writeUInt32LE(val, o + 8); });
  for (let i = 0; i < n; i++) { buf.writeUInt32LE(tileOff, offArr + 4 * i); buf.writeUInt32LE(tile.length, cntArr + 4 * i); }
  [10, 10, 0].forEach((v, i) => buf.writeDoubleLE(v, scaleOff + 8 * i));
  [0, 0, 0, 500000, 6200000, 0].forEach((v, i) => buf.writeDoubleLE(v, tieOff + 8 * i));
  tile.copy(buf, tileOff);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

test("#561 a 20,000 px decompression bomb is refused in milliseconds, without decoding", async () => {
  const ab = bombTiff(20000);
  assert.ok(ab.byteLength < 100 * 1024);
  const tiff = await fromArrayBuffer(ab), image = await tiff.getImage();
  const t0 = Date.now();
  await assert.rejects(readRastersCapped(tiff, image, { width: 2048, height: 2048 }, "bomb.tif"), /million-value limit/);
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
  // a window inside the cap is still read
  const r = await readRastersCapped(tiff, image, { window: [0, 0, 512, 512] });
  assert.equal(r[0].length, 512 * 512);
});

test("#561 a normal-size TIFF reads as before", async () => {
  const ab = bombTiff(1024);
  const tiff = await fromArrayBuffer(ab), image = await tiff.getImage();
  assert.ok(1024 * 1024 < MAX_DECODE_SAMPLES);
  const r = await readRastersCapped(tiff, image, { width: 256, height: 256 });
  assert.equal(r[0].length, 256 * 256);
});

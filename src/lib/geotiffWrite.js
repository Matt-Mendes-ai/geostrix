// TASKS.csv #1038 (review #1016, performance #1) — every GeoTIFF GeoStrix writes. geotiff.js's writeArrayBuffer creates
// a new ArrayBuffer, DataView and Uint8Array for EVERY sample (geotiffwriter.js encodeImage): 0.8 s for a 632 x 632
// evidence grid, 14 s for a 1000 x 1000 x 10 Sentinel-2 stack, 20 s for a 2000 x 2000 RGB reprojection, all with the
// window frozen. Here geotiff.js still writes the header (tags, GeoKeys, GDAL_NODATA: the part worth not re-implementing),
// from a 1 x 1 image with the same bands and type; the size tags are then set to the real width / height, and the one
// strip is filled with a single loop. The bytes are identical to geotiff.js's (test/geotiffWrite1038.test.mjs).
import { writeArrayBuffer } from "geotiff";

const HEADER = 1000; // geotiff.js's numBytesInIfd: the strip always starts here
const FAST = { Float32Array: 4, Float64Array: 8, Uint8Array: 1, Uint16Array: 2, Uint32Array: 4 }; // what encodeImage writes

// same arguments and result as geotiff.js's writeArrayBuffer(values, metadata) (flat, pixel-interleaved values)
export function writeGeoTiff(values, metadata) {
  const w = metadata.width ?? metadata.ImageWidth, h = metadata.height ?? metadata.ImageLength;
  const es = ArrayBuffer.isView(values) ? FAST[values.constructor.name] : 0;
  const n = w * h;
  if (!es || !(n > 0) || w > 65535 || h > 65535 || values.length % n || metadata.StripByteCounts || metadata.RowsPerStrip) return writeArrayBuffer(values, metadata);
  const S = values.length / n;
  const head = new Uint8Array(writeArrayBuffer(new values.constructor(S), { ...metadata, width: 1, height: 1 }));
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  // big-endian IFD at offset 8: entry count, then 12-byte entries (tag, type, count, value)
  const real = { 256: w, 257: h, 278: h, 279: values.length * es };
  const seen = new Set();
  for (let e = 0, m = hv.getUint16(8); e < m; e++) {
    const o = 10 + e * 12, tag = hv.getUint16(o);
    if (!(tag in real)) continue;
    const type = hv.getUint16(o + 2);
    if (hv.getUint32(o + 4) !== 1 || (type !== 3 && type !== 4)) return writeArrayBuffer(values, metadata); // not the layout expected
    if (type === 3) hv.setUint16(o + 8, real[tag]); else hv.setUint32(o + 8, real[tag]);
    seen.add(tag);
  }
  if (seen.size !== 4 || hv.getUint32(4) !== 8) return writeArrayBuffer(values, metadata);
  const out = new Uint8Array(HEADER + values.length * es);
  out.set(head.subarray(0, HEADER));
  if (es === 1) out.set(values, HEADER);
  else {
    const dv = new DataView(out.buffer);
    const N = values.length;
    if (es === 4 && values instanceof Float32Array) for (let i = 0, o = HEADER; i < N; i++, o += 4) dv.setFloat32(o, values[i], false);
    else if (es === 8) for (let i = 0, o = HEADER; i < N; i++, o += 8) dv.setFloat64(o, values[i], false);
    else if (es === 4) for (let i = 0, o = HEADER; i < N; i++, o += 4) dv.setUint32(o, values[i], false);
    else for (let i = 0, o = HEADER; i < N; i++, o += 2) dv.setUint16(o, values[i], false);
  }
  return out.buffer;
}

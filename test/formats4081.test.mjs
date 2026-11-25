// TASKS.csv #4081 — the round-2 harvest's low-priority formats. Every file here is MADE UP with the shape of the real ones (they stay local).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { decodeGrd } from "../src/lib/grdFormats.js";

// a compressed Geosoft grid (ES 1028: float32 + 1024): a 512-byte header, the block table, then blocks. A block that zlib shrinks has a 16-byte header
// (signature 0x0F 0x0E 0xFF 0xFE …) and a zlib stream; one that would not shrink is stored as its raw bytes, no header.
function geosoftGrid({ ne = 4, nv = 6, vpb = 4 } = {}) {
  const values = Float32Array.from({ length: ne * nv }, (_, i) => 100 + i);
  const nb = Math.ceil(nv / vpb), head = new ArrayBuffer(512), h = new DataView(head);
  h.setInt32(0, 1028, true); h.setInt32(4, 2, true); h.setInt32(8, ne, true); h.setInt32(12, nv, true); h.setInt32(16, 1, true);
  h.setFloat64(20, 10, true); h.setFloat64(28, 10, true); h.setFloat64(36, 500000, true); h.setFloat64(44, 6000000, true); h.setFloat64(68, 1, true);
  const blocks = [];
  for (let k = 0; k < nb; k++) {
    const raw = new Uint8Array(values.buffer, k * vpb * ne * 4, Math.min(vpb, nv - k * vpb) * ne * 4);
    if (k === nb - 1) { blocks.push(Uint8Array.from(raw)); continue; } // the last block stored
    const z = deflateSync(Buffer.from(raw)), hdr = new DataView(new ArrayBuffer(16));
    hdr.setUint32(0, 0xfeff0e0f, true); hdr.setUint32(4, 0x78563412, true); hdr.setInt32(8, 2, true); hdr.setInt32(12, 1, true);
    blocks.push(Uint8Array.from([...new Uint8Array(hdr.buffer), ...z]));
  }
  const table = new DataView(new ArrayBuffer(16 + 12 * nb));
  table.setUint32(0, 0xc7d8e7f8, true); table.setInt32(4, 2, true); table.setInt32(8, nb, true); table.setInt32(12, vpb, true);
  let off = 512 + 16 + 12 * nb;
  blocks.forEach((bl, k) => { table.setBigInt64(16 + 8 * k, BigInt(off), true); table.setInt32(16 + 8 * nb + 4 * k, bl.length, true); off += bl.length; });
  return { bytes: Uint8Array.from([...new Uint8Array(head), ...new Uint8Array(table.buffer), ...blocks.flatMap((bl) => [...bl])]), values };
}

test("a compressed Geosoft grid with a STORED block (no header, its raw bytes) reads: the zlib blocks and the stored one", async () => {
  const { bytes, values } = geosoftGrid();
  const g = await decodeGrd(bytes, async (u) => new Uint8Array(inflateSync(u)));
  assert.equal(g.ncols, 4); assert.equal(g.nrows, 6); assert.equal(g.compressed, true);
  assert.deepEqual(Array.from(g.values), Array.from(values), "every value, the stored block's too");
  const one = geosoftGrid({ ne: 3, nv: 2, vpb: 4 }); // a single block, stored (a small grid: zlib would not shrink it)
  assert.deepEqual(Array.from((await decodeGrd(one.bytes, async (u) => new Uint8Array(inflateSync(u)))).values), Array.from(one.values));
});

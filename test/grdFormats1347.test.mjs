// TASKS.csv #1347 — Geosoft (plain and zlib-compressed) and Surfer 6 / 7 binary grids, decoded from synthetic files built here to
// the published layouts (and checked by hand against the GXF export of a real Eagle Lake grid: 24,986 cells to float32 precision)
import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { decodeGrd, grdKind } from "../src/lib/grdFormats.js";
import { unreadableFormatAdvice } from "../src/lib/unreadableFormats.js";

const inflate = async (u8) => new Uint8Array(inflateSync(u8));
const NE = 4, NV = 3; // 4 x 3 nodes, value = 100 * row + col, one dummy at row 1 col 2
const expected = (r, c) => (r === 1 && c === 2 ? NaN : 100 * r + c);

function geosoftHeader(es, sf, kx = 1, zbase = 0, zmult = 1) {
  const h = new DataView(new ArrayBuffer(512));
  [es, sf, NE, NV, kx].forEach((v, i) => h.setInt32(4 * i, v, true));
  [10, 20, 500000, 6000000, 0, zbase, zmult].forEach((v, i) => h.setFloat64(20 + 8 * i, v, true));
  return new Uint8Array(h.buffer);
}
function float32Data() {
  const d = new DataView(new ArrayBuffer(NE * NV * 4));
  for (let r = 0; r < NV; r++) for (let c = 0; c < NE; c++) d.setFloat32(4 * (r * NE + c), r === 1 && c === 2 ? -1e32 : 100 * r + c, true);
  return new Uint8Array(d.buffer);
}
const cat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const check = (g) => { for (let r = 0; r < NV; r++) for (let c = 0; c < NE; c++) { const v = g.values[r * g.ncols + c], e = expected(r, c); if (Number.isNaN(e)) assert.ok(Number.isNaN(v), `r${r}c${c} dummy`); else assert.equal(v, e, `r${r}c${c}`); } };

test("#1347 an uncompressed float32 Geosoft grid", async () => {
  const b = cat(geosoftHeader(4, 2), float32Data());
  assert.equal(grdKind(b), "geosoft");
  const g = await decodeGrd(b, inflate);
  assert.deepEqual([g.ncols, g.nrows, g.x0, g.y0, g.dx, g.dy, g.kind, g.elementType, g.compressed], [4, 3, 500000, 6000000, 10, 20, "Geosoft", "float32", false]);
  check(g);
});

test("#1347 a compressed Geosoft grid: block table, 16-byte block headers, zlib streams of whole vectors", async () => {
  const data = float32Data(), vpb = 2, blocks = [data.subarray(0, vpb * NE * 4), data.subarray(vpb * NE * 4)];
  const z = blocks.map((p) => cat(new Uint8Array(16), new Uint8Array(deflateSync(p))));
  const tableLen = 16 + 8 * z.length + 4 * z.length;
  const table = new DataView(new ArrayBuffer(tableLen));
  table.setInt32(0, -119023417, true); table.setInt32(4, 2, true); table.setInt32(8, z.length, true); table.setInt32(12, vpb, true);
  let off = 512 + tableLen;
  z.forEach((p, i) => { table.setBigInt64(16 + 8 * i, BigInt(off), true); table.setInt32(16 + 8 * z.length + 4 * i, p.length, true); off += p.length; });
  const b = cat(geosoftHeader(1028, 2), new Uint8Array(table.buffer), ...z);
  assert.equal(grdKind(b), "geosoftCompressed");
  const g = await decodeGrd(b, inflate);
  assert.ok(g.compressed); check(g);
});

test("#1347 an int16 Geosoft grid with scaling (value = stored / ZMULT + ZBASE) and its dummy; column-ordered vectors", async () => {
  const d = new DataView(new ArrayBuffer(NE * NV * 2));
  for (let r = 0; r < NV; r++) for (let c = 0; c < NE; c++) d.setInt16(2 * (r * NE + c), r === 1 && c === 2 ? -32767 : (100 * r + c - 5) * 10, true);
  const g = await decodeGrd(cat(geosoftHeader(2, 1, 1, 5, 10), new Uint8Array(d.buffer)), inflate);
  assert.equal(g.elementType, "int16"); check(g);
  // KX -1: NV vectors are columns of NE values
  const dc = new DataView(new ArrayBuffer(NE * NV * 4));
  for (let v = 0; v < NV; v++) for (let e = 0; e < NE; e++) dc.setFloat32(4 * (v * NE + e), 10 * v + e, true);
  const gc = await decodeGrd(cat(geosoftHeader(4, 2, -1), new Uint8Array(dc.buffer)), inflate);
  assert.deepEqual([gc.ncols, gc.nrows], [3, 4]);
  assert.equal(gc.values[2 * gc.ncols + 1], 12, "row 2 (e) col 1 (v) = 10 * v + e");
});

test("#1347 Surfer 7 and Surfer 6 grids", async () => {
  const head = (tag, len) => { const d = new DataView(new ArrayBuffer(8)); for (let i = 0; i < 4; i++) d.setUint8(i, tag.charCodeAt(i)); d.setInt32(4, len, true); return new Uint8Array(d.buffer); };
  const gridSec = new DataView(new ArrayBuffer(72)); gridSec.setInt32(0, NV, true); gridSec.setInt32(4, NE, true);
  [500000, 6000000, 10, 20, 0, 230, 0, 1.70141e38].forEach((v, i) => gridSec.setFloat64(8 + 8 * i, v, true));
  const dataSec = new DataView(new ArrayBuffer(NE * NV * 8));
  for (let r = 0; r < NV; r++) for (let c = 0; c < NE; c++) dataSec.setFloat64(8 * (r * NE + c), r === 1 && c === 2 ? 1.70141e38 : 100 * r + c, true);
  const ver = new DataView(new ArrayBuffer(4)); ver.setInt32(0, 2, true);
  const s7 = cat(head("DSRB", 4), new Uint8Array(ver.buffer), head("GRID", 72), new Uint8Array(gridSec.buffer), head("DATA", NE * NV * 8), new Uint8Array(dataSec.buffer));
  const g7 = await decodeGrd(s7, inflate);
  assert.deepEqual([g7.kind, g7.ncols, g7.nrows, g7.x0, g7.dx, g7.dy], ["Surfer 7", 4, 3, 500000, 10, 20]); check(g7);
  const s6 = new DataView(new ArrayBuffer(56 + NE * NV * 4));
  "DSBB".split("").forEach((ch, i) => s6.setUint8(i, ch.charCodeAt(0))); s6.setInt16(4, NE, true); s6.setInt16(6, NV, true);
  [500000, 500030, 6000000, 6000040, 0, 230].forEach((v, i) => s6.setFloat64(8 + 8 * i, v, true));
  for (let r = 0; r < NV; r++) for (let c = 0; c < NE; c++) s6.setFloat32(56 + 4 * (r * NE + c), r === 1 && c === 2 ? 1.70141e38 : 100 * r + c, true);
  const g6 = await decodeGrd(new Uint8Array(s6.buffer), inflate);
  assert.deepEqual([g6.kind, g6.dx, g6.dy], ["Surfer 6", 10, 20]); check(g6);
});

test("#1347 not a grid is refused; .grd is no longer 'a closed format'; the raster import routes .grd", async () => {
  await assert.rejects(decodeGrd(new Uint8Array(600), inflate), /Not a Geosoft or Surfer binary grid/);
  assert.equal(unreadableFormatAdvice("mag.grd"), null);
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.ok(r.includes('isGxf || isGrd ? await parseGridFileOffThread(file, isGxf ? "gxf" : "grd")')); // #3142 — through the import worker, parseGRD as its fallback
  assert.ok(r.includes('kind === "gxf" ? parseGXF(file) : parseGRD(file)'));
});

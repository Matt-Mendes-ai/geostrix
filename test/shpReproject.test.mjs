// TASKS.csv #549 — "Reproject a file" changes only the coordinates of a shapefile: shape type (2D stays 2D,
// MultiPoint stays MultiPoint), Z / M, record count and the .dbf (field types, widths, decimals) are untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { buildZip, readZipEntries } from "../src/lib/shapefile.js";
import { reprojectShapefileZip, reprojectShpBytes } from "../src/lib/fileReproject.js";
import { pointTransform } from "../src/lib/reproject.js";

// a .dbf with the review's fields: TENURE_NO N(10,0), ISSUED D, GOOD L, AREA_HA N(12,4), NAME C(20)
function dbf(records) {
  const fields = [["TENURE_NO", "N", 10, 0], ["ISSUED", "D", 8, 0], ["GOOD", "L", 1, 0], ["AREA_HA", "N", 12, 4], ["NAME", "C", 20, 0]];
  const recLen = 1 + fields.reduce((s, f) => s + f[2], 0), hdrLen = 32 + 32 * fields.length + 1;
  const out = new Uint8Array(hdrLen + recLen * records.length + 1);
  const dv = new DataView(out.buffer);
  out[0] = 3; dv.setUint32(4, records.length, true); dv.setUint16(8, hdrLen, true); dv.setUint16(10, recLen, true);
  fields.forEach(([n, t, len, dec], i) => { const o = 32 + i * 32; for (let k = 0; k < n.length; k++) out[o + k] = n.charCodeAt(k); out[o + 11] = t.charCodeAt(0); out[o + 16] = len; out[o + 17] = dec; });
  out[hdrLen - 1] = 0x0d;
  records.forEach((r, j) => {
    let o = hdrLen + j * recLen; out[o++] = 0x20;
    fields.forEach(([, t, len], i) => { const v = String(r[i]); const s = t === "C" ? v.padEnd(len) : v.padStart(len); for (let k = 0; k < len; k++) out[o + k] = s.charCodeAt(k); o += len; });
  });
  out[out.length - 1] = 0x1a;
  return out;
}
// a 2D shapefile: records of { type: 1, x, y } or { type: 8, pts }
function shp(records, fileType) {
  const bodies = records.map((r) => {
    if (r.type === 1) { const b = new DataView(new ArrayBuffer(20)); b.setInt32(0, 1, true); b.setFloat64(4, r.x, true); b.setFloat64(12, r.y, true); return new Uint8Array(b.buffer); }
    const b = new DataView(new ArrayBuffer(40 + 16 * r.pts.length)); b.setInt32(0, 8, true); b.setInt32(36, r.pts.length, true);
    r.pts.forEach(([x, y], i) => { b.setFloat64(40 + i * 16, x, true); b.setFloat64(48 + i * 16, y, true); }); return new Uint8Array(b.buffer);
  });
  const len = 100 + bodies.reduce((s, b) => s + 8 + b.length, 0);
  const out = new Uint8Array(len), dv = new DataView(out.buffer);
  dv.setInt32(0, 9994, false); dv.setInt32(24, len / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, fileType, true);
  let o = 100;
  bodies.forEach((b, i) => { dv.setInt32(o, i + 1, false); dv.setInt32(o + 4, b.length / 2, false); out.set(b, o + 8); o += 8 + b.length; });
  return out;
}
const WGS84_PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

test("#549 a 2D Point layer stays POINT, the .dbf is copied byte for byte", async () => {
  const d = dbf([[1012345, "20200501", "T", "12.5000", "Claim A"], [1012346, "20210115", "F", "3.2500", "Claim B"]]);
  const zip = buildZip([{ name: "claims.shp", data: shp([{ type: 1, x: -130.1, y: 56.5 }, { type: 1, x: -130.0, y: 56.6 }], 1) }, { name: "claims.dbf", data: d }, { name: "claims.prj", data: new TextEncoder().encode(WGS84_PRJ) }]);
  const { bytes, report } = await reprojectShapefileZip(zip, null, 3156);
  assert.deepEqual([report[0].features, report[0].vertices, report[0].failed], [2, 2, 0]);
  const e = await readZipEntries(bytes);
  assert.deepEqual([...e["claims.dbf"]], [...d]); // N(10,0), D, L, N(12,4), C(20) untouched
  const s = new DataView(e["claims.shp"].buffer, e["claims.shp"].byteOffset);
  assert.equal(s.getInt32(32, true), 1); // POINT, not POINTZ
  assert.equal(e["claims.shp"].length, 100 + 2 * 28); // no Z / M bytes added
  const [ex, ey] = pointTransform(4326, 3156)(-130.1, 56.5);
  assert.ok(Math.abs(s.getFloat64(112, true) - ex) < 1e-6 && Math.abs(s.getFloat64(120, true) - ey) < 1e-6);
  assert.ok(e["claims.shx"] && e["claims.prj"]); // a .shx is written even when the input had none
  const x = new DataView(e["claims.shx"].buffer, e["claims.shx"].byteOffset);
  assert.deepEqual([x.getInt32(24, false), x.getInt32(100, false), x.getInt32(104, false), x.getInt32(108, false)], [(100 + 16) / 2, 50, 10, 64]);
});

test("#549 MultiPoint stays one record; its bbox and the file bbox follow the moved points", () => {
  const src = shp([{ type: 8, pts: [[0, 0], [10, 20]] }], 8);
  const r = reprojectShpBytes(src, (x, y) => [x + 1000, y + 2000]);
  assert.deepEqual([r.records, r.vertices], [1, 2]);
  const s = new DataView(r.shp.buffer);
  assert.equal(s.getInt32(32, true), 8);
  assert.deepEqual([36, 44, 52, 60].map((o) => s.getFloat64(o, true)), [1000, 2000, 1010, 2020]);
  assert.deepEqual([112, 120, 128, 136].map((o) => s.getFloat64(o, true)), [1000, 2000, 1010, 2020]);
  // the identity transform leaves every byte as it was
  assert.deepEqual([...reprojectShpBytes(r.shp, (x, y) => [x, y]).shp], [...r.shp]);
});

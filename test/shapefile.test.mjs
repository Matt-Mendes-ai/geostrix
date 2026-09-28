// TASKS.csv #415 — shapefile interop: .prj for every supported CRS, UTF-8 / .cpg text, M and MultiPoint shapes
// (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { prjWktFor, buildShapefileZip, parseShapefileZip, parseShapefileParts, readZipEntries, dbfEncoding } from "../src/lib/shapefile.js";
import { listSupportedCrs, guessEpsgFromPrjWkt } from "../src/lib/reproject.js";

test("#415 a .prj for every listed CRS, read back as the same code", () => {
  // (PROJ 9.8 also identifies all 273 as the right EPSG code with identical projection maths — TASKS.csv #415)
  for (const { code } of listSupportedCrs()) {
    const wkt = prjWktFor(code);
    assert.ok(wkt, `no .prj for EPSG:${code}`);
    assert.equal(guessEpsgFromPrjWkt(wkt), code, `EPSG:${code}`);
  }
  assert.match(prjWktFor(3156), /GCS_North_American_1983_CSRS/); // was written on plain NAD83
  assert.match(prjWktFor(32719), /"False_Northing",10000000\.0/);
  assert.equal(prjWktFor(99999), null);
});

test("#415 attribute text round-trips as UTF-8 with a .cpg; field widths are bytes", async () => {
  const long = "Granodiorito pórfiro — zona de alteração potássica com calcopirita e bornita disseminadas";
  const zip = buildShapefileZip({ epsg: 31983, baseName: "t", geomType: "point", features: [
    { geometry: [[1, 2, 3]], attributes: { NAME: "São João €", NOTE: long, V: 1.5 } },
  ] });
  const entries = await readZipEntries(zip);
  assert.equal(new TextDecoder().decode(entries["t.cpg"]), "UTF-8");
  assert.equal(guessEpsgFromPrjWkt(new TextDecoder().decode(entries["t.prj"])), 31983);
  const back = await parseShapefileZip(zip);
  const a = back.features[0].attributes;
  assert.equal(a.NAME, "São João €");
  assert.equal(a.V, 1.5);
  // cut to the 60-byte field without splitting a character
  assert.ok(long.startsWith(a.NOTE) && new TextEncoder().encode(a.NOTE).length <= 60 && !a.NOTE.includes("�"));
});

test("#415 .dbf encoding: .cpg names it, else UTF-8 is sniffed, else Windows-1252", () => {
  assert.equal(dbfEncoding("UTF-8"), "utf-8");
  assert.equal(dbfEncoding(" 65001\r\n"), "utf-8");
  assert.equal(dbfEncoding("1252"), "windows-1252");
  assert.equal(dbfEncoding("ISO 88591"), "iso-8859-1");
  assert.equal(dbfEncoding("ISO-8859-2"), "iso-8859-2");
  const dbf = (body) => { const b = new Uint8Array(33 + body.length); new DataView(b.buffer).setUint16(8, 33, true); b.set(body, 33); return b; };
  assert.equal(dbfEncoding(null, dbf(new TextEncoder().encode(" São"))), "utf-8");
  assert.equal(dbfEncoding(null, dbf(Uint8Array.from([0x20, 0x53, 0xe3, 0x6f]))), "windows-1252"); // "São" in Latin-1
  assert.equal(dbfEncoding("", dbf(new TextEncoder().encode(" plain"))), "windows-1252");
});

// minimal .shp writer for shape types GeoStrix itself never writes
function shp(records) {
  const parts = records.map((content, i) => {
    const b = new Uint8Array(8 + content.byteLength), dv = new DataView(b.buffer);
    dv.setInt32(0, i + 1, false); dv.setInt32(4, content.byteLength / 2, false); b.set(new Uint8Array(content), 8);
    return b;
  });
  const out = new Uint8Array(100 + parts.reduce((s, p) => s + p.length, 0));
  let off = 100; parts.forEach((p) => { out.set(p, off); off += p.length; });
  return out;
}
const le = (spec) => { // [["i", 8], ["d", 1.5], ...] -> ArrayBuffer (little-endian)
  const buf = new ArrayBuffer(spec.reduce((s, [t]) => s + (t === "i" ? 4 : 8), 0)), dv = new DataView(buf);
  let o = 0; spec.forEach(([t, v]) => { if (t === "i") { dv.setInt32(o, v, true); o += 4; } else { dv.setFloat64(o, v, true); o += 8; } });
  return buf;
};

test("#415 MultiPoint (8/18) becomes one feature per point; PointM / PolyLineM / PolygonM (21/23/25) read", () => {
  const multi = le([["i", 8], ["d", 0], ["d", 0], ["d", 9], ["d", 9], ["i", 3], ["d", 1], ["d", 2], ["d", 3], ["d", 4], ["d", 5], ["d", 6]]);
  const multiZ = le([["i", 18], ["d", 0], ["d", 0], ["d", 9], ["d", 9], ["i", 2], ["d", 7], ["d", 8], ["d", 9], ["d", 9], ["d", 100], ["d", 200], ["d", 100], ["d", 200]]);
  const pointM = le([["i", 21], ["d", 10], ["d", 20], ["d", 99]]);
  const lineM = le([["i", 23], ["d", 0], ["d", 0], ["d", 1], ["d", 1], ["i", 1], ["i", 2], ["i", 0], ["d", 0], ["d", 0], ["d", 1], ["d", 1], ["d", 0], ["d", 5], ["d", 0], ["d", 5]]);
  const polyM = le([["i", 25], ["d", 0], ["d", 0], ["d", 1], ["d", 1], ["i", 1], ["i", 4], ["i", 0], ["d", 0], ["d", 0], ["d", 1], ["d", 0], ["d", 1], ["d", 1], ["d", 0], ["d", 0], ["d", 0], ["d", 0], ["d", 0], ["d", 0], ["d", 0], ["d", 0]]);
  const r = parseShapefileParts({ shp: shp([multi, multiZ, pointM]) });
  assert.equal(r.skippedCount, 0);
  assert.deepEqual(r.features.map((f) => f.geometry[0]), [[1, 2, 0], [3, 4, 0], [5, 6, 0], [7, 8, 100], [9, 9, 200], [10, 20, 0]]);
  const l = parseShapefileParts({ shp: shp([lineM, polyM]) });
  assert.equal(l.skippedCount, 0);
  assert.deepEqual(l.features[0].geometry, [[0, 0, 0], [1, 1, 0]]);
  assert.equal(l.features[1].parts[0].length, 4);
});

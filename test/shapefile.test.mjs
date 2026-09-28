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

test("#415 / #487 attribute text round-trips as UTF-8 with a .cpg; text fields fit their longest value (bytes, max 254)", async () => {
  const long = "Granodiorito pórfiro — zona de alteração potássica com calcopirita e bornita disseminadas";
  const zip = buildShapefileZip({ epsg: 31983, baseName: "t", geomType: "point", features: [
    { geometry: [[1, 2, 3]], attributes: { NAME: "São João €", NOTE: long, V: 1.5, HUGE: "ç".repeat(200) } },
  ] });
  const entries = await readZipEntries(zip);
  assert.equal(new TextDecoder().decode(entries["t.cpg"]), "UTF-8");
  assert.equal(guessEpsgFromPrjWkt(new TextDecoder().decode(entries["t.prj"])), 31983);
  const back = await parseShapefileZip(zip);
  const a = back.features[0].attributes;
  assert.equal(a.NAME, "São João €");
  assert.equal(a.V, 1.5);
  assert.equal(a.NOTE, long); // #487: was cut to a fixed 60 bytes
  // 400 bytes of text: cut to DBF's 254-byte limit without splitting a 2-byte character
  assert.equal(a.HUGE, "ç".repeat(127));
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

import { shapefileZipFiles, buildZip } from "../src/lib/shapefile.js";
import { reprojectShapefileZip, readShapefileLayers } from "../src/lib/fileReproject.js";
import { pointTransform } from "../src/lib/reproject.js";

test("#487 reproject a zipped shapefile: every layer, ring and part; attributes and z kept; new .prj", async () => {
  const outer = [[460000, 6260000, 5], [461000, 6260000, 5], [461000, 6261000, 5], [460000, 6261000, 5], [460000, 6260000, 5]];
  const hole = [[460400, 6260400, 0], [460400, 6260600, 0], [460600, 6260600, 0], [460600, 6260400, 0], [460400, 6260400, 0]];
  const lineA = [[459000, 6259000, 100], [459500, 6259500, 110]], lineB = [[462000, 6262000, 120], [462100, 6262300, 130]];
  const src = buildZip([
    ...shapefileZipFiles({ features: [{ geometry: outer, parts: [outer, hole], attributes: { Unit: "Hazelton", Au: 0.5 } }], geomType: "polygon", epsg: 3156, baseName: "geology", keepFieldCase: true }),
    ...shapefileZipFiles({ features: [{ geometry: lineA, parts: [lineA, lineB], attributes: { Name: "Fault 1" } }], geomType: "polyline", epsg: 3156, baseName: "faults", keepFieldCase: true }),
  ]);
  const { bytes, report } = await reprojectShapefileZip(src, null, 3157); // From = each layer's .prj
  assert.deepEqual(report.map((r) => [r.name, r.from, r.features, r.vertices, r.failed]), [["geology", 3156, 1, 10, 0], ["faults", 3156, 1, 4, 0]]);
  const T = pointTransform(3156, 3157);
  const { layers } = await readShapefileLayers(bytes);
  assert.deepEqual(layers.map((l) => [l.name, l.epsg, l.geomType]), [["geology", 3157, "polygon"], ["faults", 3157, "polyline"]]);
  const g = layers[0].features[0];
  assert.equal(g.parts.length, 2); // the hole survives
  assert.deepEqual(g.attributes, { Unit: "Hazelton", Au: 0.5 }); // original field-name case kept
  [outer, hole].forEach((ring, k) => ring.forEach(([x, y, z], i) => {
    const [ex, ey] = T(x, y), [ax, ay, az] = g.parts[k][i];
    assert.ok(Math.hypot(ax - ex, ay - ey) < 1e-6 && az === z);
  }));
  assert.equal(layers[1].features[0].parts.length, 2);
  // and back again: within a millimetre of where it started
  const back = await readShapefileLayers((await reprojectShapefileZip(bytes, null, 3156)).bytes);
  back.layers[0].features[0].parts[0].forEach(([x, y], i) => assert.ok(Math.hypot(x - outer[i][0], y - outer[i][1]) < 1e-3));
  // no .prj and no From: refused with a reason
  const noPrj = buildZip(shapefileZipFiles({ features: [{ geometry: [[1, 2, 0]], attributes: {} }], geomType: "point", epsg: 12345, baseName: "p" }));
  await assert.rejects(reprojectShapefileZip(noPrj, null, 4326), /no \.prj — choose its CRS/);
  assert.equal((await reprojectShapefileZip(noPrj, 4326, 3857)).report[0].vertices, 1);
});

// TASKS.csv #1107 — shapefile Z records without M; whole-number columns as N(n,0)
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapefileZipFiles } from "../src/lib/shapefile.js";

const file = (files, ext) => files.find((f) => f.name.endsWith(ext)).data;
const words = (shp, at) => new DataView(shp.buffer, shp.byteOffset).getInt32(at, false);

test("#1107 PointZ / PolyLineZ records carry no M (record length)", () => {
  const pt = file(shapefileZipFiles({ geomType: "point", features: [{ geometry: [[1, 2, 3]], attributes: { a: 1 } }], epsg: 26910, baseName: "p" }), ".shp");
  assert.equal(words(pt, 104), 14); // ShapeType + X, Y, Z = 28 bytes = 14 words (was 18 with M)
  const ln = file(shapefileZipFiles({ geomType: "polyline", features: [{ geometry: [[0, 0, 1], [1, 1, 2]], attributes: { a: 1 } }], epsg: 26910, baseName: "l" }), ".shp");
  // 4 + 32 + 4 + 4 + 4 (1 part) + 2*16 (XY) + 16 (Z range) + 2*8 (Z) = 112 bytes = 56 words
  assert.equal(words(ln, 104), 56);
});

test("#1107 DBF: whole numbers -> N(9,0) / N(18,0), decimals stay N(19,6)", () => {
  const dbf = file(shapefileZipFiles({ geomType: "point", features: [{ geometry: [[1, 2, 3]], attributes: { id: 4, big: 123456789012, g: 1.5 } }], epsg: 26910, baseName: "p" }), ".dbf");
  const field = (i) => ({ name: String.fromCharCode(...dbf.slice(32 + 32 * i, 32 + 32 * i + 10)).replace(/\0+$/, ""), type: String.fromCharCode(dbf[32 + 32 * i + 11]), len: dbf[32 + 32 * i + 16], dec: dbf[32 + 32 * i + 17] });
  assert.deepEqual([0, 1, 2].map(field), [{ name: "ID", type: "N", len: 9, dec: 0 }, { name: "BIG", type: "N", len: 18, dec: 0 }, { name: "G", type: "N", len: 19, dec: 6 }]);
});

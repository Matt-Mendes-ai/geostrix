// TASKS.csv #818 — native MapInfo TAB reader (src/lib/mapinfoTab.js).
//
// Fixtures in test/fixtures/mapinfo/ were written by GDAL 3.6 (QGIS 3.30) from the MIF sources beside them:
//   ogr2ogr -f "MapInfo File" -lco ENCODING=CP1252 utm10_mixed.tab src/utm10_mixed.mif   (likewise wgs84_points)
// and the reader's output on them was checked against `ogr2ogr -f GeoJSON` of the same files. GDAL's writer turns
// MIF rectangles / ellipses / arcs into regions and polylines, so the native arc, rounded rectangle, ellipse, font
// symbol, multipoint and V800 region objects are covered by a small .MAP built byte by byte below instead.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseMapInfoTab, mapinfoCoordSysToEpsg, parseTabHeader } from "../src/lib/mapinfoTab.js";

const FX = new URL("./fixtures/mapinfo/", import.meta.url);
const load = (base) => ({
  tab: fs.readFileSync(new URL(`${base}.tab`, FX), "latin1"),
  map: new Uint8Array(fs.readFileSync(new URL(`${base}.map`, FX))),
  id: new Uint8Array(fs.readFileSync(new URL(`${base}.id`, FX))),
  dat: new Uint8Array(fs.readFileSync(new URL(`${base}.dat`, FX))),
  name: base,
});
const byName = (layer, n) => layer.features.find((f) => f.attributes.Name === n);

test("mixed UTM 10N NAD83 table: split by family, exact coordinates, attributes and EPSG 26910", () => {
  const { layers, skipped, skippedCount } = parseMapInfoTab(load("utm10_mixed"));
  assert.deepEqual(layers.map((l) => [l.name, l.geomType]), [
    ["utm10_mixed (points)", "point"], ["utm10_mixed (lines)", "polyline"], ["utm10_mixed (polygons)", "polygon"], ["utm10_mixed (text)", "point"],
  ]);
  for (const l of layers) { assert.equal(l.epsg, 26910); assert.match(l.crsNote, /UTM zone 10N, NAD83/); }
  assert.deepEqual(skipped, { noGeometry: 1, deleted: 0, unsupported: 0, corrupt: 0 });
  assert.equal(skippedCount, 1);
  const [pts, lines, polys, text] = layers;

  const p = byName(pts, "pt font");
  assert.deepEqual(p.geometry, [[500100.25, 5500200.75]]);
  assert.deepEqual(p.parts, [[[500100.25, 5500200.75]]]);
  assert.deepEqual(p.attributes, { Name: "pt font", Dip: 10, Az: 20, Val: 1.5, Amt: 12.25, Day: "2024-10-17", Ok: "T" });
  assert.deepEqual(byName(pts, "custom").geometry, [[500020, 5504020]]); // custom-symbol point (type 0x2c)
  assert.deepEqual(pts.features.filter((f) => f.attributes.Name === "multipoint").map((f) => f.geometry[0]), [[500000, 5504000], [500010, 5504010]]);

  assert.deepEqual(byName(lines, "line").parts, [[[500000, 5500000], [500100, 5500100]]]);
  const pl = byName(lines, "pline");
  assert.deepEqual(pl.geometry, [[500000, 5500000], [500050, 5500020.5], [500100, 5500000]]);
  assert.deepEqual(pl.attributes, { Name: "pline", Dip: 12, Az: 22, Val: -3.25, Amt: 1.1, Day: null, Ok: "T" });
  assert.deepEqual(byName(lines, "multi").parts, [[[500000, 5501000], [500100, 5501000]], [[500000, 5501100], [500050, 5501150], [500100, 5501100]]]);

  const hole = byName(polys, "region hole");
  assert.deepEqual(hole.parts, [
    [[500000, 5502000], [500200, 5502000], [500200, 5502200], [500000, 5502200], [500000, 5502000]],
    [[500050, 5502050], [500150, 5502050], [500150, 5502150], [500050, 5502150], [500050, 5502050]],
  ]);
  assert.deepEqual(hole.geometry, hole.parts[0]);
  // 200 km wide: too big for int16 offsets, so this one is stored uncompressed
  assert.deepEqual(byName(polys, "big triangle").parts, [[[400000, 5400000], [600000, 5400000], [500000, 5600000], [400000, 5400000]]]);

  assert.equal(text.features.length, 1);
  assert.equal(text.features[0].attributes._text, "45/120");
  assert.equal(text.features[0].attributes.Name, "text");
  assert.ok(text.fields.some((f) => f.name === "_text"));
  assert.ok(Math.abs(text.features[0].geometry[0][0] - 500000) < 1e-6 && Math.abs(text.features[0].geometry[0][1] - 5503000) < 0.01);
  assert.deepEqual(pts.fields.map((f) => f.type), ["string", "integer", "integer", "number", "number", "date", "string"]);
});

test("WGS84 lon/lat points: one family keeps the base name, WindowsLatin1 text decoded, EPSG 4326", () => {
  const { layers } = parseMapInfoTab(load("wgs84_points"));
  assert.equal(layers.length, 1);
  assert.equal(layers[0].name, "wgs84_points");
  assert.equal(layers[0].epsg, 4326);
  assert.deepEqual(layers[0].features.map((f) => [f.geometry[0], f.attributes]), [
    [[-128.5, 56.25], { Name: "Ruisseau Galène", Dip: 35 }],
    [[-128.75, 56.125], { Name: "Bedding", Dip: 80 }],
  ]);
  // the .TAB may also be handed over as raw bytes (e.g. File.arrayBuffer()); it is decoded by its own !charset
  const bytesTab = { ...load("wgs84_points"), tab: new Uint8Array(fs.readFileSync(new URL("wgs84_points.tab", FX))) };
  assert.deepEqual(parseMapInfoTab(bytesTab).layers[0].features[0].attributes, { Name: "Ruisseau Galène", Dip: 35 });
});

// ---- a hand-built .MAP (version 500, 512-byte blocks, UTM 10N NAD83, scale 100 = centimetres) ----
function buildMap() {
  const buf = new ArrayBuffer(2048), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setInt32(0x100, 42424242, true); dv.setInt16(0x104, 500, true); dv.setInt16(0x106, 512, true);
  u8[0x161] = 1; dv.setInt16(0x16a, 74, true); u8[0x16d] = 8; u8[0x16e] = 0; u8[0x16f] = 7;
  dv.setFloat64(0x170, 100, true); dv.setFloat64(0x178, 100, true);
  [-123, 0, 0.9996, 500000, 0, 0].forEach((v, k) => dv.setFloat64(0x190 + 8 * k, v, true));
  const I = (x) => Math.round(x * 100);
  // object block at 1024, centre (500000, 5500000)
  const OB = 1024, CB = 1536;
  u8[OB] = 2; dv.setInt32(OB + 4, I(500000), true); dv.setInt32(OB + 8, I(5500000), true); dv.setInt32(OB + 12, CB, true); dv.setInt32(OB + 16, CB, true);
  let p = OB + 20;
  const offsets = [];
  const b = (v) => { u8[p++] = v; }, s = (v) => { dv.setInt16(p, v, true); p += 2; }, l = (v) => { dv.setInt32(p, v, true); p += 4; };
  const obj = (type, row) => { offsets.push(p); b(type); l(row); };
  // coordinate block at 1536
  let c = CB + 8;
  const cl = (v) => { dv.setInt32(c, v, true); c += 4; };
  // row 1: arc (0x0b), quarter of the ellipse in box (500000,5500000)-(500100,5500100), 0 -> 90 degrees
  obj(0x0b, 1); s(0); s(900); l(I(500000)); l(I(5500000)); l(I(500100)); l(I(5500100)); l(I(500050)); l(I(5500050)); l(I(500100)); l(I(5500100)); b(1);
  // row 2: rounded rectangle (0x17), 20 m corner diameters
  obj(0x17, 2); l(I(20)); l(I(20)); l(I(500200)); l(I(5500000)); l(I(500300)); l(I(5500100)); b(1); b(1);
  // row 3: multipoint (0x35), two points in the coordinate block
  const mpPtr = c; cl(I(500400)); cl(I(5500400)); cl(I(500410.5)); cl(I(5500410.5));
  obj(0x35, 3); l(mpPtr); l(2); p += 15; b(1); b(0); l(I(500400)); l(I(5500400)); l(I(500400)); l(I(5500400)); l(I(500410.5)); l(I(5500410.5));
  // row 4: V800 region (0x3e), a square with a square hole; section headers are 28 bytes each in V800
  const regPtr = c;
  const rings = [
    [[501000, 5501000], [501100, 5501000], [501100, 5501100], [501000, 5501100], [501000, 5501000]],
    [[501025, 5501025], [501075, 5501025], [501075, 5501075], [501025, 5501075], [501025, 5501025]],
  ];
  const hdr = 28 * rings.length;
  let vi = 0;
  rings.forEach((r, k) => { cl(r.length); cl(k === 0 ? 1 : 0); cl(0); cl(0); cl(0); cl(0); cl(hdr + vi * 8); vi += r.length; });
  rings.flat().forEach(([x, y]) => { cl(I(x)); cl(I(y)); });
  obj(0x3e, 4); l(regPtr); l(vi * 8); l(rings.length); p += 33; l(0); l(0); l(I(501000)); l(I(5501000)); l(I(501100)); l(I(5501100)); b(1); b(1);
  // row 5: font symbol point (0x29)
  obj(0x29, 5); p += 12; l(I(502000.25)); l(I(5502000.75)); b(1);
  // row 6: compressed ellipse (0x19): int16 offsets from the object block centre
  obj(0x19, 6); s(I(-10)); s(I(-20)); s(I(10)); s(I(20)); b(1); b(1);
  // row 7: no geometry
  dv.setInt16(OB + 2, p - OB - 20, true);
  u8[CB] = 3; dv.setInt16(CB + 2, c - CB - 8, true);
  const id = new Uint8Array(4 * 7), idv = new DataView(id.buffer);
  offsets.forEach((o, k) => idv.setInt32(4 * k, o, true));
  return { map: u8, id };
}
const SYN_TAB = '!table\n!version 300\n!charset WindowsLatin1\n\nDefinition Table\n  Type NATIVE Charset "WindowsLatin1"\n  Fields 1\n    Label Char (10) ;\n';

test("native arc, rounded rectangle, ellipse, font symbol, multipoint and V800 region objects (no .DAT)", () => {
  const { map, id } = buildMap();
  const { layers, skipped } = parseMapInfoTab({ tab: SYN_TAB, map, id, dat: null, name: "syn" });
  assert.deepEqual(layers.map((l) => [l.name, l.geomType, l.features.length]), [["syn (points)", "point", 3], ["syn (lines)", "polyline", 1], ["syn (polygons)", "polygon", 3]]);
  assert.deepEqual(skipped, { noGeometry: 1, deleted: 0, unsupported: 0, corrupt: 0 });
  assert.equal(layers[0].epsg, 26910);
  const [pts, lines, polys] = layers;
  assert.deepEqual(pts.features.map((f) => f.geometry[0]), [[500400, 5500400], [500410.5, 5500410.5], [502000.25, 5502000.75]]);
  assert.deepEqual(pts.features[0].attributes, {});
  // arc: 2-degree steps (46 points) + GDAL's repeated end point, centre (500050, 5500050), radius 50
  const arc = lines.features[0].geometry;
  assert.equal(arc.length, 47);
  assert.deepEqual(arc[0], [500100, 5500050]);
  assert.ok(Math.abs(arc[45][0] - 500050) < 1e-6 && Math.abs(arc[45][1] - 5500100) < 1e-6);
  for (const [x, y] of arc) assert.ok(Math.abs(Math.hypot(x - 500050, y - 5500050) - 50) < 1e-6);
  // rounded rectangle: four 45-point corner arcs (+1 repeat each) and the closing point; corner radius 10 m
  const rr = polys.features[0].geometry;
  assert.equal(rr.length, 4 * 46 + 1);
  assert.deepEqual(rr[0], rr[rr.length - 1]);
  assert.ok(Math.abs(rr[0][0] - 500200) < 1e-6 && Math.abs(rr[0][1] - 5500010) < 1e-6);
  assert.ok(rr.every(([x, y]) => x >= 500200 - 1e-6 && x <= 500300 + 1e-6 && y >= 5500000 - 1e-6 && y <= 5500100 + 1e-6));
  // V800 region: both rings, in file order
  assert.deepEqual(polys.features[1].parts, [
    [[501000, 5501000], [501100, 5501000], [501100, 5501100], [501000, 5501100], [501000, 5501000]],
    [[501025, 5501025], [501075, 5501025], [501075, 5501075], [501025, 5501075], [501025, 5501025]],
  ]);
  // compressed ellipse around the block centre: 180 points + repeat, already closed
  const el = polys.features[2].geometry;
  assert.equal(el.length, 181);
  assert.ok(Math.abs(el[0][0] - 500010) < 1e-6 && Math.abs(el[0][1] - 5500000) < 1e-6);
  for (const [x, y] of el) assert.ok(Math.abs(((x - 500000) / 10) ** 2 + ((y - 5500000) / 20) ** 2 - 1) < 1e-9);
});

test("CoordSys clauses map to EPSG codes (or null with a note)", () => {
  const e = (s) => mapinfoCoordSysToEpsg(s).epsg;
  assert.equal(e('CoordSys Earth Projection 8, 74, "m", -123, 0, 0.9996, 500000, 0'), 26910);
  assert.equal(e('CoordSys Earth Projection 8, 74, "m", -129, 0, 0.9996, 500000, 0 Bounds (-7745844.3, -9997964.9) (8745844.3, 9997964.9)'), 26909);
  assert.equal(e("CoordSys Earth Projection 1, 104"), 4326);
  assert.equal(e("CoordSys Earth Projection 1, 74"), 4269);
  assert.equal(e("CoordSys Earth Projection 1, 62"), 4267);
  assert.equal(e('CoordSys Earth Projection 8, 62, "m", -129, 0, 0.9996, 500000, 0'), 26709);
  assert.equal(e('CoordSys Earth Projection 8, 66, "m", -135, 0, 0.9996, 500000, 0'), 26708); // NAD27 Canada
  assert.equal(e('CoordSys Earth Projection 8, 999, 7, -8, 160, 176, "m", -123, 0, 0.9996, 500000, 0'), 26710);
  assert.equal(e('CoordSys Earth Projection 8, 104, "m", -129, 0, 0.9996, 500000, 0'), 32609);
  assert.equal(e('CoordSys Earth Projection 8, 104, "m", 147, 0, 0.9996, 500000, 10000000'), 32755);
  assert.equal(e('CoordSys Earth Projection 9, 74, "m", -126, 45, 50, 58.5, 1000000, 0'), 3005);
  const ne = mapinfoCoordSysToEpsg('CoordSys NonEarth Units "m" Bounds (0, 0) (1000, 1000)');
  assert.equal(ne.epsg, null); assert.match(ne.crsNote, /Non-earth/);
  const ft = mapinfoCoordSysToEpsg('CoordSys Earth Projection 8, 74, "ft", -123, 0, 0.9996, 500000, 0');
  assert.equal(ft.epsg, null); assert.match(ft.crsNote, /ft/);
});

test("the .TAB header parser reads charset, type and fields; unreadable inputs throw", () => {
  const h = parseTabHeader('!table\n!version 300\n!charset WindowsLatin1\n\nDefinition Table\n  Type NATIVE Charset "Neutral"\n  Fields 3\n    Structure Char (20) ;\n    Dip Integer ;\n    Grade Decimal (8, 3) Index 1 ;\n');
  assert.equal(h.charset, "WindowsLatin1");
  assert.equal(h.tableType, "NATIVE");
  assert.deepEqual(h.fields.map((f) => [f.name, f.tabType, f.width, f.decimals]), [["Structure", "char", 20, 0], ["Dip", "integer", 0, 0], ["Grade", "decimal", 8, 3]]);
  const { map, id } = buildMap();
  assert.throws(() => parseMapInfoTab({ tab: SYN_TAB, map: null, id: null }), /no map objects/);
  assert.throws(() => parseMapInfoTab({ tab: '!table\n!version 300\nDefinition Table\n  Type "RASTER"\n', map, id }), /RASTER/);
  assert.throws(() => parseMapInfoTab({ tab: SYN_TAB, map: new Uint8Array(1024), id }), /Not a valid MapInfo \.MAP/);
});

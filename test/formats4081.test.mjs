// TASKS.csv #4081 — the round-2 harvest's low-priority formats. Every file here is MADE UP with the shape of the real ones (they stay local).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { decodeGrd } from "../src/lib/grdFormats.js";
import { isSurpacStr, parseSurpacStr } from "../src/lib/surpacStr.js";
import { sl3ToTable } from "../src/lib/sl3Table.js";
import { parseTemReceiver } from "../src/lib/maxwellTem.js";
import { readTemText } from "../src/lib/temLines.js";
import { unreadableFormatAdvice } from "../src/lib/unreadableFormats.js";
import { whatIsThis } from "../src/lib/startChecklist.js";

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

// a Surpac string file: string number, Y (northing), X (easting), Z, descriptions; a 0 record ends a segment, '0, … END' the file
const STR = [
  "made-up,01-Jan-20,Test strings,", "0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000",
  "1, 6000100.000, 500100.000, 250.000, ore", "1, 6000100.000, 500200.000, 250.000,", "1, 6000200.000, 500200.000, 260.000,", "1, 6000100.000, 500100.000, 250.000,", "0, 0.000, 0.000, 0.000,",
  "1, 6000300.000, 500100.000, 240.000,", "1, 6000300.000, 500300.000, 240.000,", "0, 0.000, 0.000, 0.000,",
  "2, 6000400.000, 500400.000, 230.000, spot", "0, 0.000, 0.000, 0.000,",
  "3, 6000500.000, 500500.000, 200.000,", "3, 6000600.000, 500500.000, 210.000,", "0, 0.000, 0.000, 0.000, END",
].join("\r\n");

test("a Surpac .str: one boundary layer per string number, Y before X, a repeated first point closes it, single points left out", () => {
  assert.ok(isSurpacStr(STR, "pit.str")); assert.ok(!isSurpacStr(STR, "pit.txt")); assert.ok(!isSurpacStr("a,b,c\n1,2,3\n4,5,6", "x.str"));
  const r = parseSurpacStr(STR, "pit");
  assert.equal(r.title, "Test strings"); assert.equal(r.strings, 2); assert.equal(r.segments, 3); assert.equal(r.spots, 1); assert.equal(r.skipped, 0);
  assert.deepEqual(r.specs.map((s) => s.name), ["pit — string 1", "pit — string 3"]);
  const [one, three] = r.specs;
  assert.equal(one.polylines.length, 2); assert.deepEqual(one.closedFlags, [true, false]);
  assert.equal(one.polylines[0].length, 3, "the closing repeat dropped");
  assert.deepEqual(one.polylines[0][0], { x: 500100, y: 6000100, z: 250 }, "X is the third field, Y the second");
  assert.ok(one.useVertexZ); assert.equal(three.polylines[0][1].z, 210);
  // flat: every Z 0 -> a plan, no elevations; many string numbers -> one layer
  const flat = parseSurpacStr(STR.replace(/, (2[0-9]0|200)\.000,/g, ", 0.000,"), "flat");
  assert.equal(flat.specs[0].useVertexZ, false); assert.deepEqual(flat.specs[0].polylines[0][0], { x: 500100, y: 6000100 });
  const many = ["h,d,p,", "0,0,0,0,0,0,0", ...Array.from({ length: 15 }, (_, k) => [`${k + 1}, ${6e6 + k}, ${5e5}, 10,`, `${k + 1}, ${6e6 + k}, ${5e5 + 50}, 10,`, "0, 0, 0, 0,"]).flat()].join("\n");
  const m = parseSurpacStr(many, "slices");
  assert.equal(m.specs.length, 1); assert.equal(m.specs[0].name, "slices"); assert.equal(m.specs[0].polylines.length, 15);
});

test("Victoria's H / D tables (no label, no empty field): the names line up with the values, the unlabelled units record read", () => {
  const vic = [
    "H0002\tVersion\t4\t\t", "H0004\tState\tVIC\t\t",
    "H1000\tHole_id\tSurveyed Depth\tDip\tAzimuth_TRUE", "H1001\tNA\tmetres\tdegrees\tdegrees", "H1004\t\t\t0\t0",
    "D\tDH-23-001\t0\t-60\t90", "D\tDH-23-001\t50\t-59\t91", "D\tDH-23-002\t0\t-90\t0", "EOF\t\t\t\t",
  ].join("\r\n");
  const r = sl3ToTable(vic);
  assert.deepEqual(r.names, ["Hole_id", "Surveyed Depth", "Dip (degrees)", "Azimuth_TRUE (degrees)"], "the hole id kept; metres not added to a name");
  const rows = r.text.trim().split("\n").slice(1).map((l) => l.split("\t"));
  assert.deepEqual(rows[1], ["DH-23-001", "50", "-59", "91"]);
  assert.match(r.note, /3 rows, 4 columns, with units/);
  const coll = ["H1000\tHole_ID\tEasting_MGA\tNorthing_MGA\tDate", "H1001\tNA\tmetres\tmetres\tdd/mm/yyyy", "D\tDH-23-001\t500100\t6000100\t01/02/2022"].join("\n");
  assert.deepEqual(sl3ToTable(coll).names, ["Hole_ID", "Easting_MGA", "Northing_MGA", "Date"]);
});

// a fixed-loop Maxwell .tem with the loop's corners in map coordinates in its header (a GSV survey's .tx file holds the same corners)
function fixedLoopTem() {
  const T = [0.1, 0.2, 0.4, 0.8, 1.6], pad = (v) => String(v).padStart(12);
  const L = ["TEM File Created by MAXWELL", "LINE:100 DATATYPE:TEM CONFIG:FIXEDLOOP BFREQ:2.500 OFFTIME:100.000 ONTIME:100.000 &", "LOOP:LOOP_A &",
    "LV1X:500000.00 LV1Y:6000000.00 LV1Z:300.00 &", "LV2X:500800.00 LV2Y:6000000.00 LV2Z:310.00 &", "LV3X:500800.00 LV3Y:6000600.00 LV3Z:320.00 &", "LV4X:500000.00 LV4Y:6000600.00 LV4Z:305.00",
    "/TIMES(ms)=" + T.join(","), ["EAST", "NORTH", "ELEV", "STATION", "COMPONENT", "UNITS", ...T.map((_, k) => `CH${k + 1}`)].map(pad).join(" ")];
  for (let s = 0; s < 4; s++) L.push([500100 + 100 * s, 6000300, 300, 500100 + 100 * s, "Z", "pT/A", ...T.map((t) => (900 * Math.exp(-t)).toFixed(3))].map(pad).join(" "));
  return L.join("\n");
}

test("a fixed-loop .tem keeps its loop (map coordinates, with Z): the Result says how many corners; a lone .tx is named", () => {
  const m = parseTemReceiver(fixedLoopTem());
  assert.equal(m.loop.length, 4); assert.deepEqual(m.loop[2], { x: 500800, y: 6000600, z: 320 });
  const d = readTemText(fixedLoopTem(), "line100.tem");
  assert.equal(d.loop.length, 4); assert.ok(d.notes.includes("Loop: 4 corners."), d.notes.join(" | "));
  // a moving loop's corners (relative to the station: small numbers) are not a map loop
  assert.equal(parseTemReceiver(fixedLoopTem().replace(/LV(\d)X:5\d+\.00 LV\1Y:60\d+\.00/g, "LV$1X:0.00 LV$1Y:100.00")).loop, null);
  assert.match(unreadableFormatAdvice("AR_LOOP_1.TX"), /transmitter-loop file.*\.tem/);
});

test("the binary databases and side files the harvest held are named with the way out", () => {
  assert.match(unreadableFormatAdvice("a00000009.gdbtable"), /Esri File Geodatabase.*GeoPackage/);
  assert.match(unreadableFormatAdvice("a00000009.gdbtablx"), /Esri File Geodatabase/);
  assert.match(unreadableFormatAdvice("survey_mag.isi"), /Intrepid metadata/);
  assert.match(unreadableFormatAdvice("drilling.mdb"), /Access database/); // #603
  assert.match(unreadableFormatAdvice("lines.gdb"), /Geosoft database/); // #603
  assert.equal(unreadableFormatAdvice("roads.CODE.atx"), null, "ArcGIS's attribute index beside a shapefile is not a geodatabase part");
  assert.equal(whatIsThis("pit.str"), null, "a Surpac string file is read by the 3D view's drop");
});

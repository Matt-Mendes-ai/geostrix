// TASKS.csv #4066 (side 2's #4061 inventory of the GSQ open-file reports) — ER Mapper rasters: the .ers header and its headerless data file,
// band-interleaved by line. Every file here is SYNTHETIC (the real ones stay local).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isErsHeader, parseErs, dmsOrNumber, ersEpsg, ersDataName, ersRows } from "../src/lib/erMapper.js";
import { rowsPicture } from "../src/lib/rasterRows.js";
import { rasterFileSet, ersDataOf } from "../src/lib/rasterSideFiles.js";
import { mapsDropRoutes } from "../src/lib/mapLayerBuild.js";

// a header the shape ER Mapper writes (tabs, nested Begin / End blocks, quoted strings)
const header = (o = {}) => `DatasetHeader Begin
\tVersion\t\t= "7.0"
\tName\t\t= "${o.name || "mag.ers"}"
\tDataSetType\t= ERStorage
\tDataType\t= Raster
\tByteOrder\t= ${o.order || "LSBFirst"}
${o.offset ? `\tHeaderOffset\t= ${o.offset}\n` : ""}\tCoordinateSpace Begin
\t\tDatum\t\t= "${o.datum || "GDA94"}"
\t\tProjection\t= "${o.proj || "MGA54"}"
\t\tCoordinateType\t= ${o.ctype || "EN"}
\t\tRotation\t= ${o.rot || "0:0:0.0"}
\tCoordinateSpace End
\tRasterInfo Begin
\t\tCellType\t= ${o.type || "IEEE4ByteReal"}
\t\tCellInfo Begin
\t\t\tXdimension\t= ${o.dx || "50"}
\t\t\tYdimension\t= ${o.dy || "20"}
\t\tCellInfo End
\t\tNrOfLines\t= ${o.lines || 3}
\t\tNrOfCellsPerLine\t= ${o.cols || 4}
\t\tRegistrationCoord Begin
${o.geo ? `\t\t\tLatitude\t= ${o.geo[0]}\n\t\t\tLongitude\t= ${o.geo[1]}` : "\t\t\tEastings\t= 400000\n\t\t\tNorthings\t= 7000100"}
\t\tRegistrationCoord End
\t\tRegistrationCellX\t= ${o.rx || 0}
\t\tRegistrationCellY\t= ${o.ry || 0}
\t\tNrOfBands\t= ${o.bands || 1}
${o.nodata === null ? "" : `\t\tNullCellValue\t= ${o.nodata ?? -99999}\n`}\t\tBandId Begin
\t\t\tValue\t= "1"
\t\tBandId End
\tRasterInfo End
DatasetHeader End
`;

// cell values by line (line 0 = north), band-interleaved: per line, band 1's cells then band 2's
function dataBytes(lines, { type = "f4", little = true, bands = 1, offset = 0 } = {}) {
  const size = { f4: 4, f8: 8, i2: 2, u1: 1, i4: 4 }[type], nl = lines.length, nc = lines[0].length;
  const buf = new ArrayBuffer(offset + nl * bands * nc * size), dv = new DataView(buf);
  lines.forEach((row, l) => {
    for (let b = 0; b < bands; b++) row.forEach((v, c) => {
      const o = offset + (l * bands + b) * nc * size + c * size, x = v + b * 1000; // band b adds 1000 x b
      if (type === "f4") dv.setFloat32(o, x, little); else if (type === "f8") dv.setFloat64(o, x, little);
      else if (type === "i2") dv.setInt16(o, x, little); else if (type === "i4") dv.setInt32(o, x, little); else dv.setUint8(o, x);
    });
  });
  return new Uint8Array(buf);
}
const LINES = [[1, 2, 3, 4], [5, 6, -99999, 8], [9, 10, 11, 12.5]]; // north line first

test("#4066 the header parser reads blocks, quoted values and each band id", () => {
  assert.ok(isErsHeader(header()));
  assert.ok(!isErsHeader("x,y,z\n1,2,3"));
  const h = parseErs(header({ bands: 2 }));
  assert.equal(h.get("RasterInfo.NrOfLines"), "3");
  assert.equal(h.get("CoordinateSpace.Datum"), "GDA94");
  assert.equal(h.get("RasterInfo.CellInfo.Xdimension"), "50");
  assert.equal(h.get("RasterInfo.RegistrationCoord.Eastings"), "400000");
  assert.equal(h.get("ByteOrder"), "LSBFirst");
  assert.deepEqual(h.bands, ["1"]);
  assert.equal(dmsOrNumber("-23:30:00.0"), -23.5);
  assert.equal(dmsOrNumber("0:00:36"), 0.01);
  assert.equal(dmsOrNumber("0.002"), 0.002);
  assert.ok(Number.isNaN(dmsOrNumber("")));
});

test("#4066 datum + projection -> EPSG (MGA / AMG zones, UTM north / south, geographic, raw)", () => {
  assert.deepEqual(ersEpsg("GDA94", "MGA54"), { epsg: 28354 });
  assert.deepEqual(ersEpsg("GDA2020", "MGA55"), { epsg: 7855 });
  assert.deepEqual(ersEpsg("AGD66", "AMG54"), { epsg: 20254 });
  assert.deepEqual(ersEpsg("AGD84", "AMG53"), { epsg: 20353 });
  assert.deepEqual(ersEpsg("WGS84", "SUTM54"), { epsg: 32754 });
  assert.deepEqual(ersEpsg("WGS84", "NUTM9"), { epsg: 32609 });
  assert.deepEqual(ersEpsg("NAD83", "NUTM9"), { epsg: 26909 });
  assert.deepEqual(ersEpsg("GDA94", "GEODETIC"), { epsg: 4283 });
  assert.deepEqual(ersEpsg("GDA94", "GEODETIC", "LATLON"), { epsg: 4283 });
  assert.deepEqual(ersEpsg("AGD66", "GEODETIC"), { epsg: 4202 });
  assert.ok(ersEpsg("RAW", "RAW").raw);
  assert.ok(ersEpsg("GDA94", "MGA54", "RAW").raw);
  assert.ok(ersEpsg("GDA94", "ZZZ9").unknown, "a name no system matches is unknown, not guessed");
  assert.ok(ersEpsg("MYDATUM", "MYGRID").local || ersEpsg("MYDATUM", "MYGRID").unknown);
});

test("#4066 float32 grid: the north line first in the file becomes the north row; registration is the top-left corner; no data is the header's value", () => {
  const r = ersRows(header(), dataBytes(LINES), "mag.ers");
  assert.equal(r.ncols, 4); assert.equal(r.nrows, 3);
  // rows run south -> north: the file's last line (9 10 11 12.5) is row 0
  assert.deepEqual(Array.from(r.values.slice(0, 4)), [9, 10, 11, 12.5]);
  assert.deepEqual(Array.from(r.values.slice(8, 12)), [1, 2, 3, 4]);
  assert.equal(r.dx, 50); assert.equal(r.dy, 20);
  // top-left corner (400000, 7000100); the south-west node's centre is half a cell in from the south-west corner (400000, 7000040)
  assert.equal(r.x0, 400025); assert.equal(r.y0, 7000050);
  assert.equal(r.dummy, -99999);
  assert.equal(r.epsgTag, 28354);
  assert.match(r.note, /ER Mapper grid, 4 × 3 cells/);
  assert.match(r.note, /EPSG:28354/);
  // the picture's drape spans exactly the grid's own area: x 400000..400200, y 7000040..7000100
  const p = rowsPicture(r);
  assert.deepEqual(p.record.bbox, [400000, 7000040, 400200, 7000100]);
  assert.equal(p.record.epsgTag, 28354, "the header's CRS reaches the raster record");
  assert.equal(p.record.grid.nx, 4);
  // the kept values are north row first, and the no-data cell is NaN there
  assert.equal(p.record.grid.values[0], 1);
  assert.ok(Number.isNaN(p.record.grid.values[4 + 2]));
  assert.equal(p.record.grid.values[11], 12.5);
});

test("#4066 the registration cell, the byte order, the cell types, a header offset and several bands", () => {
  // registered at cell (1, 2): the coordinate is that cell's corner, so the grid's top-left sits 1 cell west and 2 cells north of it
  const r = ersRows(header({ rx: 1, ry: 2 }), dataBytes(LINES), "x.ers");
  assert.equal(r.x0, 400000 - 50 + 25); assert.equal(r.y0, 7000100 + 40 - 40 - 10);
  // big-endian int16
  const be = ersRows(header({ type: "Signed16BitInteger", order: "MSBFirst", nodata: -32768 }), dataBytes([[1, -2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]], { type: "i2", little: false }), "x.ers");
  assert.deepEqual(Array.from(be.values.slice(8, 12)), [1, -2, 3, 4]);
  assert.equal(be.dummy, -32768);
  assert.match(be.note, /ER Mapper grid, /);
  // unsigned 8-bit and float64
  assert.deepEqual(Array.from(ersRows(header({ type: "Unsigned8BitInteger" }), dataBytes([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 255]], { type: "u1" }), "x.ers").values.slice(0, 4)), [9, 10, 11, 255]);
  assert.deepEqual(Array.from(ersRows(header({ type: "IEEE8ByteReal" }), dataBytes(LINES, { type: "f8" }), "x.ers").values.slice(8, 12)), [1, 2, 3, 4]);
  // a header offset of 16 bytes
  const off = ersRows(header({ offset: 16 }), dataBytes(LINES, { offset: 16 }), "x.ers");
  assert.deepEqual(Array.from(off.values.slice(8, 12)), [1, 2, 3, 4]);
  // two bands, interleaved by line: band 1 is read, and it is said
  const two = ersRows(header({ bands: 2 }), dataBytes(LINES, { bands: 2 }), "x.ers");
  assert.deepEqual(Array.from(two.values.slice(8, 12)), [1, 2, 3, 4], "band 1, not band 2 (which is band 1 + 1000)");
  assert.deepEqual(Array.from(two.values.slice(0, 4)), [9, 10, 11, 12.5]);
  assert.match(two.note, /Band 1 of 2 read/);
});

test("#4066 float32 no data compares as float32; a header with no NullCellValue keeps only the non-finite as no data", () => {
  const r = ersRows(header({ nodata: 1e32 }), dataBytes([[1, 2, 3, 4], [5, 6, 1e32, 8], [9, 10, 11, 12]]), "x.ers");
  assert.equal(r.dummy, Math.fround(1e32));
  const cell = Array.from(r.values).find((v) => v > 1e30);
  assert.equal(cell, r.dummy, "the stored float32 equals the dummy");
  assert.equal(ersRows(header({ nodata: null }), dataBytes(LINES), "x.ers").dummy, null);
});

test("#4066 degrees: a LATLON grid with d:m:s registration and cell sizes", () => {
  const r = ersRows(header({ proj: "GEODETIC", ctype: "LATLON", geo: ["-23:00:00.0", "139:00:00.0"], dx: "0:00:36.0", dy: "0:00:36.0" }), dataBytes(LINES), "ll.ers");
  assert.equal(r.epsgTag, 4283);
  assert.ok(Math.abs(r.dx - 0.01) < 1e-12 && Math.abs(r.dy - 0.01) < 1e-12);
  assert.ok(Math.abs(r.x0 - (139 + 0.005)) < 1e-9);
  assert.ok(Math.abs(r.y0 - (-23 - 0.02 - 0.005)) < 1e-9, "the south-west node: top -23, 3 lines of 0.01 down, half a cell in");
  assert.match(r.note, /ER Mapper grid, /);
});

test("#4066 refusals say what is wrong: not a header, rotated, no map coordinates, an unknown cell type, a short data file, a missing key", () => {
  assert.throws(() => ersRows("x,y\n1,2", dataBytes(LINES), "a.ers"), /not an ER Mapper header/);
  assert.throws(() => ersRows(header({ rot: "0:30:0" }), dataBytes(LINES), "a.ers"), /is rotated/);
  assert.throws(() => ersRows(header({ datum: "RAW", proj: "RAW" }), dataBytes(LINES), "a.ers"), /no map coordinates/);
  assert.throws(() => ersRows(header({ type: "Weird" }), dataBytes(LINES), "a.ers"), /Cell type Weird isn't supported/);
  assert.throws(() => ersRows(header(), dataBytes(LINES).slice(0, 40), "a.ers"), /data file is too short/);
  assert.throws(() => ersRows(header().replace(/NrOfLines/, "Lines"), dataBytes(LINES), "a.ers"), /has no NrOfLines/);
  const unknown = ersRows(header({ datum: "MYDATUM", proj: "MYGRID" }), dataBytes(LINES), "a.ers");
  assert.equal(unknown.epsgTag, null);
  assert.match(unknown.note, /set the Source CRS/);
});

test("#4066 the data file's name: the header's name without .ers, or its DataFile", () => {
  assert.equal(ersDataName(header(), "Mag_TMI.ers"), "Mag_TMI");
  assert.equal(ersDataName(header().replace("DataType\t= Raster", "DataType\t= Raster\n\tDataFile\t= \"other_name\""), "Mag_TMI.ers"), "other_name");
});

test("#4066 rasterFileSet pairs a header with its extension-less data file, and the data file is neither an orphan nor ignored", () => {
  const f = (name) => ({ name });
  const ers = f("Mag_TMI.ers"), dat = f("Mag_TMI"), other = f("notes.txt"), loneBare = f("README");
  const set = rasterFileSet([ers, dat, other, loneBare]);
  assert.equal(set.images.length, 1);
  assert.equal(set.images[0].file, ers);
  assert.equal(set.images[0].data, dat);
  assert.equal(ersDataOf(ers), dat);
  assert.deepEqual(set.ignored.map((x) => x.name).sort(), ["README", "notes.txt"]);
  // the data file is matched case-insensitively and only by the exact stem
  assert.equal(rasterFileSet([f("A.ers"), f("a")]).images[0].data.name, "a");
  assert.equal(rasterFileSet([f("A.ers"), f("A2")]).images[0].data, null);
  // one GSQ set of UBC sections names the data file stem.dat (the extension-less file wins when both exist)
  const setDat = rasterFileSet([f("S_ip.ers"), f("S_ip.dat"), f("other.dat")]);
  assert.equal(setDat.images[0].data.name, "S_ip.dat");
  assert.deepEqual(setDat.ignored.map((x) => x.name), ["other.dat"]);
  assert.equal(rasterFileSet([f("S_ip.ers"), f("S_ip.dat"), f("S_ip")]).images[0].data.name, "S_ip");
  // a header with no data file: not paired (the import says what to select)
  assert.equal(ersDataOf(rasterFileSet([f("B.ers")]).images[0].file), null);
});

test("#4066 a drop on the Maps tab routes the header and its data file to the raster import", () => {
  const r = mapsDropRoutes(["Mag_TMI.ers", "Mag_TMI", "other.csv", "Stray"]);
  assert.deepEqual(r.raster.sort(), ["Mag_TMI", "Mag_TMI.ers"]);
  assert.deepEqual(r.table, ["other.csv"]);
  assert.deepEqual(mapsDropRoutes(["S_ip.ers", "S_ip.dat", "t.dat"]).raster.sort(), ["S_ip.dat", "S_ip.ers"]);
});

test("#4066 wiring: the worker, the picker, the Browser panel and the import pipeline know .ers", () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("src/lib/rasterImport.worker.js"), /kind === "ers" \? ersRows\(header, new Uint8Array\(buf\), name\)/);
  assert.match(read("src/lib/raster.js"), /isErs = \/\\\.ers\$\/i\.test\(file\.name\)/);
  assert.match(read("src/lib/raster.js"), /parseGridFileOffThread\(file, isGxf \? "gxf" : isErs \? "ers" : "grd"\)/);
  assert.match(read("src/modules/RasterModule.jsx"), /accept="\.tif,\.tiff,\.gxf,\.grd,\.ers,/);
  assert.match(read("src/components/DbBrowserPanel.jsx"), /"\.grd", "\.ers", "\.vo"/);
  const imp = read("src/modules/viewer/importPipelineImpl.js");
  assert.match(imp, /gxf\|grd\|ers\|dxf\|obj/);
  assert.match(imp, /readSiblingFiles\(filePath, \[ersDataName\(await file\.text\(\), file\.name\)\]\)/);
  assert.match(read("src/modules/GeophysicsModule.jsx"), /\[i\.world, i\.xml, i\.prj, i\.data\]/);
});

test("#4066 parseERS without a data file says which file to select with the header", async () => {
  const { parseERS } = await import("../src/lib/raster.js");
  const file = { name: "Mag_TMI.ers", text: async () => header(), arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(() => parseERS(file), /"Mag_TMI\.ers" needs its data file "Mag_TMI": select both\./);
});

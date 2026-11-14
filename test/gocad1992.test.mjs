// TASKS.csv #1992 — GOCAD TSurf / PLine / VSet import (ASCII), alone or several objects in one file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGocad, gocadCrsText } from "../src/lib/gocad.js";
import { parseSolidFile, parseSolidFileStream } from "../src/lib/solidImport.js";
import { SOLID_IMPORT_EXTENSIONS } from "../src/lib/solidImportMeta.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const TS = `GOCAD TSurf 1
HEADER {
name:Granite top
*solid*color:1 0 0 1
}
GOCAD_ORIGINAL_COORDINATE_SYSTEM
NAME "MGA94 / zone 51"
AXIS_NAME "X" "Y" "Z"
AXIS_UNIT "m" "m" "m"
ZPOSITIVE Elevation
END_ORIGINAL_COORDINATE_SYSTEM
PROPERTIES depth
TFACE
VRTX 1 400000 6500000 300
VRTX 2 400100 6500000 310
PVRTX 3 400100 6500100 320 12.5
VRTX 4 400000 6500100 305
VRTX 9 1 1 1
TRGL 1 2 3
TRGL 1 3 4
TFACE
ATOM 5 2
VRTX 6 400200 6500000 315
TRGL 5 6 3
BSTONE 1
BORDER 7 1 2
END
`;
const PL = `GOCAD PLine 1
HEADER {name:Fault A}
GOCAD_ORIGINAL_COORDINATE_SYSTEM
NAME Default
ZPOSITIVE Depth
END_ORIGINAL_COORDINATE_SYSTEM
ILINE
VRTX 1 400000 6500000 100
VRTX 2 400050 6500020 150
VRTX 3 400100 6500040 200
SEG 1 2
SEG 2 3
ILINE
VRTX 4 401000 6501000 50
VRTX 5 401010 6501000 60
SEG 4 5
END
`;
const VS = `GOCAD VSet 1
HEADER {
name:soils
}
PROPERTIES Au Cu
NO_DATA_VALUES -99999 -99999
PVRTX 1 400010 6500010 301 0.012 45
PVRTX 2 400020 6500010 302 -99999 51
PVRTX 3 400030 6500010 303 0.3 n/a
END
`;

test("#1992 TSurf: vertices, ATOM reuse, two faces in one part, unused vertices left out, header name and CRS", () => {
  const [s] = parseGocad(TS);
  assert.equal(s.type, "TSurf"); assert.equal(s.name, "Granite top");
  assert.equal(s.triangleCount, 3); assert.equal(s.vertexCount, 5); // vertex 9 is not used by a triangle
  assert.equal(s.faces, 2);
  // the ATOM 5 -> 2 triangle shares vertex 2's position
  const v = (k) => Array.from(s.positions.slice(k * 3, k * 3 + 3));
  assert.deepEqual(v(s.indices[6]), [400100, 6500000, 310]);
  assert.equal(gocadCrsText(s.crs), "MGA94 / zone 51");
});

test("#1992 PLine: ILINE parts chained from SEGs, ZPOSITIVE Depth read as elevation", () => {
  const [p] = parseGocad(PL);
  assert.equal(p.name, "Fault A");
  assert.equal(p.lines.length, 2);
  assert.deepEqual(p.lines[0].map((q) => q.z), [-100, -150, -200]);
  assert.equal(p.lines[1].length, 2);
  assert.equal(gocadCrsText(p.crs), ""); // "Default" names nothing
});

test("#1992 VSet: points with PROPERTIES; NO_DATA and unreadable values are missing", () => {
  const [v] = parseGocad(VS);
  assert.deepEqual(v.properties, ["Au", "Cu"]);
  assert.deepEqual(v.points.map((p) => p.values), [[0.012, 45], [null, 51], [0.3, null]]);
  assert.equal(v.points[2].z, 303);
});

test("#1992 several objects in one file (a .gp group) and CRLF line ends", () => {
  const objs = parseGocad((TS + PL + VS + "GOCAD Voxet 1\nHEADER {name:grid}\nEND\n").replace(/\n/g, "\r\n"));
  assert.deepEqual(objs.map((o) => [o.type, o.name]), [["TSurf", "Granite top"], ["PLine", "Fault A"], ["VSet", "soils"], ["Voxet", "grid"]]);
  assert.equal(objs[3].unsupported, true);
});

test("#1992 the solid import reads .ts and .gp (TSurfs only, the rest named in the note)", async () => {
  assert.match(SOLID_IMPORT_EXTENSIONS, /\.ts,\.gp/);
  const s = parseSolidFile("granite.ts", TS);
  assert.equal(s.format, "GOCAD"); assert.equal(s.parts[0].layer, "Granite top"); assert.equal(s.triangleCount, 3);
  assert.match(s.note, /TSurf objects: 1, the file names its coordinate system "MGA94 \/ zone 51"/);
  const g = await parseSolidFileStream(new File([TS + PL + VS], "model.gp"));
  assert.equal(g.parts.length, 1);
  assert.match(g.note, /2 other object\(s\) not read here \(PLine, VSet\)/);
  assert.throws(() => parseSolidFile("fault.ts", PL), /No GOCAD TSurf with triangles in this file \(it holds PLine\)/);
});

test("#1992 routes: .pl as boundaries, .ts / .gp as solids and .vs to Geophysics from the 3D View; .vs read in Point survey", () => {
  const imp = read("src/modules/viewer/importPipelineImpl.js");
  assert.match(imp, /if \(\/\\\.pl\$\/\.test\(name\)\) \{/);
  assert.match(imp, /addBoundary\(\{ name: o\.name, polylines: o\.lines, closedFlags: o\.lines\.map\(\(\) => false\), useVertexZ: true/);
  assert.match(imp, /if \(\/\\\.\(obj\|ts\|gp\)\$\/i\.test\(f\.name\)\) importSolidFile\(f\)/);
  assert.match(imp, /GOCAD point sets are read as point surveys/);
  const geo = read("src/modules/GeophysicsModule.jsx");
  assert.match(geo, /accept="\.xyz,\.fld,\.bse,\.txt,\.gpx,\.wpt,\.dfn,\.dat,\.vs"/);
  assert.match(geo, /const columns = \["X", "Y", "Z", \.\.\.props/);
  // #1990 / #1992: files this drop read are not also listed as 'Not imported'
  assert.match(geo, /laz\|vs\)\$\/i\.test\(f\.name\) && !\(\/\\\.\(dfn\|dat\)\$\/i\.test\(f\.name\) && gdfPair\(files\)\)/);
});

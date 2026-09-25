// TASKS.csv #408 — 3D DXF strings keep Z and layers; face-only files are solids; export round-trips Z.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDXF, dxfToBoundaries, buildDXF } from "../src/lib/dxf.js";

const dxf = (body) => ["0", "SECTION", "2", "ENTITIES", ...body, "0", "ENDSEC", "0", "EOF"].join("\n");
const poly3d = ["0", "POLYLINE", "8", "PIT_CREST", "66", "1", "70", "8",
  "0", "VERTEX", "8", "PIT_CREST", "10", "1000", "20", "2000", "30", "1180",
  "0", "VERTEX", "8", "PIT_CREST", "10", "1100", "20", "2000", "30", "1150", "0", "SEQEND"];
const lw = ["0", "LWPOLYLINE", "8", "CLAIMS", "90", "3", "70", "1", "10", "0", "20", "0", "10", "10", "20", "0", "10", "10", "20", "10"];

test("#408 3D POLYLINE keeps Z, layers are kept, closed flag read", () => {
  const r = parseDXF(dxf([...poly3d, ...lw]));
  assert.equal(r.has3D, true);
  assert.deepEqual(r.polylines[0], [{ x: 1000, y: 2000, z: 1180 }, { x: 1100, y: 2000, z: 1150 }]);
  assert.deepEqual(r.layers, ["PIT_CREST", "CLAIMS"]);
  assert.deepEqual(r.closed, [false, true]);
  const b = dxfToBoundaries(dxf([...poly3d, ...lw]), "site");
  assert.deepEqual(b.map((x) => [x.name, x.useVertexZ]), [["site — PIT_CREST", true], ["site — CLAIMS", false]]);
});

test("#408 a face-only DXF is flagged as a solid", () => {
  const faces = ["0", "3DFACE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "1", "21", "0", "31", "0", "12", "0", "22", "1", "32", "0", "13", "0", "23", "1", "33", "0"];
  assert.throws(() => parseDXF(dxf(faces)), (e) => e.facesOnly === true);
});

test("#408 export writes a 3D POLYLINE that re-imports with the same Z", () => {
  const text = buildDXF({ geomType: "line", features: [{ geometry: [[500, 600, 1200.5], [510, 600, 1190.25]], attributes: { hole_id: "DH-1" } }] });
  const r = parseDXF(text);
  assert.deepEqual(r.polylines[0].map((p) => p.z), [1200.5, 1190.25]);
  assert.equal(r.layers[0], "DH-1");
});

import { sectionStringsToRows, sectionStringsToDXF, kindOf } from "../src/lib/sectionExport.js";
import { parseDXF as parseDXF409 } from "../src/lib/dxf.js";
test("#409 section contacts/faults/strings export as vertex CSV rows and 3D DXF polylines", () => {
  const sections = [{ name: "4200N", contacts: [
    { id: "c1", unit: "DACT", isUpperContact: true, points: [{ l: 0, x: 463000, y: 6178000, z: 1100 }, { l: 50, x: 463050, y: 6178000, z: 1080 }] },
    { id: "f1", unit: "Main Fault", kind: "fault", isUpperContact: false, points: [{ l: 10, x: 463010, y: 6178000, z: 1150 }, { l: 20, x: 463020, y: 6178000, z: 900 }] },
  ] }];
  const rows = sectionStringsToRows(sections);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.kind), ["contact", "contact", "fault", "fault"]);
  assert.equal(rows[3].z, 900);
  const { dxf, count } = sectionStringsToDXF(sections);
  assert.equal(count, 2);
  const back = parseDXF409(dxf);
  assert.equal(back.polylines.length, 2);
  assert.ok(back.has3D);
  assert.deepEqual(back.polylines[1].map((p) => p.z), [1150, 900]);
  assert.match(back.layers.join(" "), /4200N_contact_DACT/);
  assert.equal(kindOf({ isUpperContact: true }), "contact");
});

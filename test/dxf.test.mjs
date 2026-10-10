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

// TASKS.csv #414 — streaming, typed-array solid import with one part per layer.
import { parseDXFMesh, createDXFMeshParser } from "../src/lib/dxf.js";
import { parseSolidFile, parseSolidFileStream, parseOBJMesh, solidBounds } from "../src/lib/solidImport.js";

const face = (layer, pts) => ["0", "3DFACE", "8", layer, ...pts.flatMap((p, k) => [`${10 + k}`, `${p[0]}`, `${20 + k}`, `${p[1]}`, `${30 + k}`, `${p[2]}`])];
const tri = (layer, a, b, c) => face(layer, [a, b, c, c]);
const solidDxf = (eol = "\n") => ["0", "SECTION", "2", "HEADER", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
  ...tri("PIT", [0, 0, 100], [10, 0, 100], [10, 10, 105]),
  ...tri("PIT", [0, 0, 100], [10, 10, 105], [0, 10, 100]),       // shares 2 vertices with the first: welded
  ...face("PIT", [[20, 0, 90], [30, 0, 90], [30, 10, 90], [20, 10, 90]]), // a genuine quad: 2 triangles
  ...tri("PIT", [5, 5, 5], [5, 5, 5], [6, 6, 6]),                  // degenerate: dropped
  ...tri("STOPE", [100, 100, 0], [110, 100, 0], [110, 110, 0]),
  "0", "POLYLINE", "8", "PILLAR", "66", "1", "70", "64",
  ...[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]].flatMap(([x, y, z]) => ["0", "VERTEX", "8", "PILLAR", "10", `${x + 200}`, "20", `${y}`, "30", `${z}`, "70", "192"]),
  "0", "VERTEX", "8", "PILLAR", "10", "0", "20", "0", "30", "0", "70", "128", "71", "1", "72", "-2", "73", "3", "74", "4",
  "0", "SEQEND", "0", "ENDSEC", "0", "EOF"].join(eol) + eol;

test("#414 DXF solid: one part per layer, welded, quads split, degenerates dropped, polyface read", () => {
  const m = parseDXFMesh(solidDxf());
  assert.deepEqual(m.parts.map((p) => [p.layer, p.indices.length / 3, p.positions.length / 3]), [["PIT", 4, 10], ["STOPE", 1, 3], ["PILLAR", 2, 4]]);
  assert.ok(m.parts.every((p) => p.positions instanceof Float64Array && p.indices instanceof Uint32Array));
  assert.equal(m.triangleCount, 7);
  assert.equal(m.nFaceEntities, 5); // 4 PIT + 1 STOPE; the degenerate face still counts as an entity and registers its 2 distinct vertices (as before #414)
  assert.equal(m.nPolyfaceMeshes, 1);
  const pit = m.parts[0];
  assert.deepEqual([...pit.indices.slice(0, 6)], [0, 1, 2, 0, 2, 3]); // shared corner vertices reused
  assert.deepEqual([...pit.positions.slice(6, 9)], [10, 10, 105]);
});

test("#414 feeding a DXF in chunks gives the same mesh, whatever the split and line endings", () => {
  for (const eol of ["\n", "\r\n", "\r"]) {
    const text = solidDxf(eol);
    const whole = JSON.stringify(parseDXFMesh(text).parts.map((p) => [p.layer, [...p.positions], [...p.indices]]));
    for (let cut = 1; cut < text.length; cut += 7) {
      for (const size of [1, 3, 64]) {
        const p = createDXFMeshParser();
        p.feed(text.slice(0, cut));
        for (let i = cut; i < text.length; i += size) p.feed(text.slice(i, i + size));
        assert.equal(JSON.stringify(p.finish().parts.map((q) => [q.layer, [...q.positions], [...q.indices]])), whole, `eol ${JSON.stringify(eol)} cut ${cut} size ${size}`);
      }
      if (eol !== "\n") break; // one cut per non-LF ending keeps the test fast; LF gets every 7th
    }
  }
});

test("#414 DXF errors: no ENTITIES section, or no faces", () => {
  assert.throws(() => parseDXFMesh("0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n"), /No ENTITIES section/);
  assert.throws(() => parseDXFMesh(dxf(lw)), /No 3D faces found/);
});

test("#414 OBJ: objects become parts sharing the global vertex list; negative refs; quads fan-split", () => {
  const obj = ["# pit", "v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0", "o shell", "f 1 2 3 4", "o bench", "v 5 5 5", "f -1 -3 -4", "f 1//1 2//2 3//3"].join("\n");
  const m = parseOBJMesh(obj);
  assert.deepEqual(m.parts.map((p) => [p.layer, p.indices.length / 3, p.positions.length / 3]), [["shell", 2, 4], ["bench", 2, 4]]);
  const bench = m.parts[1];
  assert.deepEqual([...bench.positions.slice(0, 3)], [5, 5, 5]); // local vertex 0 = global vertex 5
  assert.equal(m.quads, 1);
});

test("#414 parseSolidFileStream (File) = parseSolidFile (text); bounds over all parts", async () => {
  const text = solidDxf("\r\n");
  const a = parseSolidFile("pit.dxf", text), b = await parseSolidFileStream(new File([text], "pit.dxf"));
  assert.equal(JSON.stringify(b.parts.map((p) => [...p.positions])), JSON.stringify(a.parts.map((p) => [...p.positions])));
  assert.match(b.note, /3 layers/);
  assert.deepEqual(solidBounds(a.parts), { min: { x: 0, y: 0, z: 0 }, max: { x: 201, y: 110, z: 105 } });
  await assert.rejects(parseSolidFileStream(new File(["x"], "pit.stl")), /Unsupported solid format/);
});

import * as THREE from "three";
import { solidNormals } from "../src/lib/solidImport.js";
test("#483 solid normals from the worker equal three.js computeVertexNormals after the world->scene rotation", () => {
  // a UTM-placed, stretched torus: an INDEXED mesh, so each vertex sums the normals of the faces sharing it
  const g = new THREE.TorusGeometry(120, 40, 24, 48);
  const pos = g.getAttribute("position").array;
  const n = pos.length / 3, world = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { world[i * 3] = pos[i * 3] + 460000; world[i * 3 + 1] = pos[i * 3 + 1] * 0.7 + 6260000; world[i * 3 + 2] = pos[i * 3 + 2] + 900; }
  const indices = Uint32Array.from(g.getIndex().array);
  const wn = solidNormals(world, indices);
  const o = { x: 460050, y: 6260020, z: 880 };
  const scene = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) { scene[i] = world[i] - o.x; scene[i + 1] = world[i + 2] - o.z; scene[i + 2] = o.y - world[i + 1]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  const ref = geo.getAttribute("normal").array;
  let worst = 0;
  for (let i = 0; i < n * 3; i += 3) worst = Math.max(worst, Math.abs(ref[i] - wn[i]), Math.abs(ref[i + 1] - wn[i + 2]), Math.abs(ref[i + 2] + wn[i + 1]));
  assert.ok(worst < 1e-4, `worst ${worst}`);
});

import { sceneVertsToWorld, sceneVertsToWorldFlat } from "../src/lib/meshExport.js";
test("#491 sceneVertsToWorldFlat gives exactly sceneVertsToWorld's numbers, flattened (indexed Uint16/Uint32 and non-indexed)", () => {
  const o = { x: 460123.4, y: 6261234.5, z: 812.25 }, r2 = (v) => Math.round(v * 100) / 100;
  const mk = (n, index) => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
    for (let i = 0; i < p.length; i++) p[i] = Math.sin(i * 1.7) * 900 + i * 0.013;
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    if (index) g.setIndex(index);
    return g;
  };
  for (const g of [mk(300, Array.from({ length: 900 }, (_, i) => (i * 7) % 300)), mk(70000, Array.from({ length: 210000 }, (_, i) => (i * 13) % 70000)), mk(99, null)]) {
    const ref = sceneVertsToWorld(g, o), flat = sceneVertsToWorldFlat(g, o, r2), raw = sceneVertsToWorldFlat(g, o);
    assert.deepEqual(flat.vertices, ref.vertices.flatMap((v) => v.map(r2)));
    assert.deepEqual(raw.vertices, ref.vertices.flat());
    assert.deepEqual(flat.indices, ref.indices);
    assert.ok(Array.isArray(flat.indices) && Array.isArray(flat.vertices));
  }
});

// TASKS.csv #550 — R12 2D polyline elevation, zero elevations, CIRCLE / ARC, skipped entity counts
import { dxfSkippedText } from "../src/lib/dxf.js";
const contour = (z, x0) => ["0", "POLYLINE", "8", "CONTOURS", "66", "1", "70", "0", "10", "0", "20", "0", "30", String(z),
  "0", "VERTEX", "8", "CONTOURS", "10", String(x0), "20", "0", "30", "0",
  "0", "VERTEX", "8", "CONTOURS", "10", String(x0 + 50), "20", "40", "30", "0", "0", "SEQEND"];
const lwAt = (elev) => ["0", "LWPOLYLINE", "8", "DESIGN", "38", String(elev), "90", "2", "70", "0", "10", "5", "20", "5", "10", "25", "20", "5"];

test("#550 a 2D POLYLINE takes the header's elevation (R12 contours); a 0 among real elevations is real", () => {
  const r = parseDXF(dxf([...contour(450, 0), ...contour(460, 100), ...lwAt(0)]));
  assert.deepEqual(r.polylines.map((pl) => pl.map((q) => q.z)), [[450, 450], [460, 460], [0, 0]]);
  assert.equal(r.has3D, true);
  assert.equal(r.zerosDropped, false);
});

test("#550 a file whose strings are ALL at 0 is a 2D plan (no elevation), and says so", () => {
  const r = parseDXF(dxf([...contour(0, 0), ...lwAt(0), ...lw]));
  assert.ok(r.polylines.every((pl) => pl.every((q) => q.z === undefined)));
  assert.equal(r.has3D, false);
  assert.equal(r.zerosDropped, true);
});

test("#550 CIRCLE and ARC become polylines; TEXT / INSERT / MTEXT are counted, not silently dropped", () => {
  const body = [
    "0", "CIRCLE", "8", "COLLARS", "10", "100", "20", "200", "30", "950", "40", "2",
    "0", "ARC", "8", "PIT", "10", "0", "20", "0", "30", "900", "40", "10", "50", "0", "51", "90",
    "0", "TEXT", "8", "LABELS", "10", "100", "20", "200", "1", "DDH-01",
    "0", "TEXT", "8", "LABELS", "10", "110", "20", "200", "1", "DDH-02",
    "0", "INSERT", "8", "COLLARS", "2", "CROSS", "10", "100", "20", "200",
    "0", "MTEXT", "8", "NOTES", "1", "note",
  ];
  const r = parseDXF(dxf(body));
  assert.equal(r.polylines.length, 2);
  const circle = r.polylines[0], arc = r.polylines[1];
  assert.equal(r.closed[0], true);
  assert.ok(circle.every((q) => Math.abs(Math.hypot(q.x - 100, q.y - 200) - 2) < 1e-9 && q.z === 950));
  assert.equal(r.closed[1], false);
  assert.ok(Math.abs(arc[0].x - 10) < 1e-9 && Math.abs(arc[0].y) < 1e-9); // starts at 0 degrees
  assert.ok(Math.abs(arc[arc.length - 1].x) < 1e-9 && Math.abs(arc[arc.length - 1].y - 10) < 1e-9); // ends at 90
  assert.deepEqual(r.skipped, { TEXT: 2, INSERT: 1, MTEXT: 1 });
  assert.match(dxfSkippedText(r.skipped), /^skipped 2 TEXT, 1 INSERT, 1 MTEXT/);
  assert.equal(dxfSkippedText({}), "");
});

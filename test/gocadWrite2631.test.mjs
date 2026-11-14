// TASKS.csv #2631 — GOCAD ASCII written natively: a PLine (.pl) of lines, a VSet (.vs) of points with properties, and the TSurf (.ts) of
// meshExport.js, each read back with gocad.js (vertices, faces / segments, names, CRS text). SYNTHETIC coordinates.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { parseGocad, gocadCrsText } from "../src/lib/gocad.js";
import { writePLine, writeVSet, gocadPropertyNames, NO_DATA } from "../src/lib/gocadWrite.js";
import { vectorGocadText, numericColumns } from "../src/lib/viewer/vectorGocad.js";
import { exportSurfaceTS } from "../src/lib/meshExport.js";

const E0 = 500000, N0 = 6000000;

test("a PLine reads back: names, CRS, the lines and their vertices", () => {
  const lines = [[[E0, N0, 100], [E0 + 10, N0, 105], [E0 + 20, N0 + 5, 110]], [[E0, N0 + 50, 90], [E0 + 30, N0 + 50, 95]]];
  const w = writePLine("Fault set", lines, { epsg: 26909, comments: ["Project CRS: EPSG:26909"] });
  assert.equal(w.lines, 2); assert.equal(w.vertices, 5); assert.equal(w.zMissing, 0);
  assert.match(w.text, /^# Fault set — exported from GeoStrix\n# Project CRS: EPSG:26909\nGOCAD PLine 1$/m);
  assert.match(w.text, /ZPOSITIVE Elevation/);
  const [o] = parseGocad(w.text);
  assert.equal(o.type, "PLine"); assert.equal(o.name, "Fault set");
  assert.equal(gocadCrsText(o.crs), "EPSG:26909");
  assert.equal(o.crs.zSign, 1);
  assert.equal(o.lines.length, 2);
  assert.deepEqual(o.lines[0], lines[0].map(([x, y, z]) => ({ x, y, z })));
  assert.deepEqual(o.lines[1], lines[1].map(([x, y, z]) => ({ x, y, z })));
});

test("a ring is written once round, with a closing segment, and reads back closed", () => {
  const ring = [[0, 0, 5], [10, 0, 5], [10, 10, 5], [0, 10, 5], [0, 0, 5]];
  const w = writePLine("Claim", [ring]);
  assert.equal(w.vertices, 4, "the repeated first point is not a fifth vertex");
  assert.match(w.text, /SEG 4 1/);
  const [o] = parseGocad(w.text);
  assert.equal(o.lines.length, 1);
  assert.deepEqual(o.lines[0].map((p) => [p.x, p.y, p.z]), ring);
  assert.match(w.text, /NAME Default/, "no CRS: named 'Default', not a made-up code");
});

test("one-point lines and non-finite points are left out; a missing z is 0 and counted", () => {
  const w = writePLine("L", [[[1, 1, 1]], [[0, 0], [5, 5]], [[NaN, 0, 0], [1, 1, 1], [2, 2, 2]]]);
  assert.equal(w.lines, 2); assert.equal(w.vertices, 4); assert.equal(w.zMissing, 2);
  const o = parseGocad(w.text)[0];
  assert.deepEqual(o.lines[0].map((p) => p.z), [0, 0]);
});

test("a VSet with properties: PVRTX columns, missing values as the no-data value, read back as null", () => {
  const pts = [{ x: E0, y: N0, z: 50, values: [1.5, 20] }, { x: E0 + 5, y: N0 + 5, z: 60, values: [null, 30] }, { x: E0 + 9, y: N0, z: 70, values: [2.25, undefined] }];
  const w = writeVSet("Contacts", pts, ["Au g/t", "Cu"], { epsg: 3005 });
  assert.deepEqual(w.properties, ["Au_g_t", "Cu"]);
  assert.match(w.text, /PROPERTIES Au_g_t Cu\nNO_DATA_VALUES -99999 -99999\nPVRTX 1 500000\.0000 6000000\.0000 50\.0000 1\.5 20/);
  const [o] = parseGocad(w.text);
  assert.equal(o.type, "VSet"); assert.equal(o.name, "Contacts"); assert.equal(gocadCrsText(o.crs), "EPSG:3005");
  assert.deepEqual(o.properties, ["Au_g_t", "Cu"]);
  assert.deepEqual(o.points.map((p) => [p.x, p.y, p.z]), pts.map((p) => [p.x, p.y, p.z]));
  assert.deepEqual(o.points.map((p) => p.values), [[1.5, 20], [null, 30], [2.25, null]]);
  assert.equal(NO_DATA, -99999);
});

test("a VSet without properties is plain VRTX lines", () => {
  const w = writeVSet("Samples", [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5 }], []);
  assert.doesNotMatch(w.text, /PVRTX|PROPERTIES/);
  assert.equal(w.zMissing, 1);
  assert.deepEqual(parseGocad(w.text)[0].points.map((p) => [p.x, p.y, p.z]), [[1, 2, 3], [4, 5, 0]]);
});

test("property names are one word each, unique, never empty", () => {
  assert.deepEqual(gocadPropertyNames(["Au (ppm)", "au_ppm", "", "  ", "Cu"]), ["Au_ppm", "au_ppm_", "property_3", "property_4", "Cu"]);
});

test("names cannot break the header: braces and line breaks go", () => {
  const w = writePLine("A}\nGOCAD TSurf 1", [[[0, 0, 0], [1, 1, 1]]]);
  const objs = parseGocad(w.text);
  assert.equal(objs.length, 1, "one object, not a second injected one");
  assert.equal(objs[0].type, "PLine");
});

test("vectorGocadText: points -> a VSet with the numeric attributes, lines and parts -> one PLine", () => {
  const pts = { geomType: "point", features: [
    { geometry: [[E0, N0, 10]], attributes: { hole_id: "A1", depth: 12.5, note: "x" } },
    { geometry: [[E0 + 1, N0, 20]], attributes: { hole_id: "A2", depth: null, note: "y" } }] };
  assert.deepEqual(numericColumns(pts.features), ["depth"], "text columns are left out");
  const v = vectorGocadText(pts, { label: "Collars", epsg: 26909, crs: "EPSG:26909" });
  assert.equal(v.ext, "vs"); assert.equal(v.count, 2); assert.deepEqual(v.properties, ["depth"]);
  const o = parseGocad(v.text)[0];
  assert.deepEqual(o.points.map((p) => p.values), [[12.5], [null]]);
  assert.match(v.text, /# Project CRS: EPSG:26909/);

  const ln = { geomType: "polyline", features: [
    { geometry: [[0, 0, 1], [1, 1, 2]], attributes: {} },
    { geometry: [[0, 0], [0, 0]], parts: [[[5, 5, 5], [6, 6, 6]], [[7, 7, 7], [8, 8, 8], [9, 9, 9]]], attributes: {} }] };
  const l = vectorGocadText(ln, { label: "Traces" });
  assert.equal(l.ext, "pl"); assert.equal(l.count, 3);
  assert.deepEqual(parseGocad(l.text)[0].lines.map((a) => a.length), [2, 2, 3]);
});

test("the TSurf of a generated surface reads back with the same vertices, faces and CRS", () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 10, 1, 0, 0, 2, -5, 10, 3, -5], 3)); // the scene is y-up: (east, elevation, -north)
  g.setIndex([0, 1, 2, 1, 3, 2]);
  const t = exportSurfaceTS("Granite top", g, { x: E0, y: N0, z: 0 }, null, { epsg: 26909 });
  const [o] = parseGocad(t);
  assert.equal(o.type, "TSurf"); assert.equal(o.name, "Granite top"); assert.equal(gocadCrsText(o.crs), "EPSG:26909");
  assert.equal(o.vertexCount, 4); assert.equal(o.triangleCount, 2); assert.equal(o.faces, 1);
  assert.deepEqual(Array.from(o.positions), [E0, N0, 0, E0 + 10, N0, 1, E0, N0 + 5, 2, E0 + 10, N0 + 5, 3]);
  assert.deepEqual(Array.from(o.indices), [0, 1, 2, 1, 3, 2]);
});

// TASKS.csv #1876 — design strings: geometry, offsets, joins, typed vertices and the DXF round trip
import test from "node:test";
import assert from "node:assert/strict";
import { stringStats, offsetString, joinStrings, splitString, fromDistanceBearing, orthoPoint, snapToGrid, nearestPoint, nearestOnString, stringFeatures, stringsFromDxf, stringRows } from "../src/lib/designStrings.js";
import { buildDXF } from "../src/lib/dxf.js";

const square = [[0, 0, 100], [100, 0, 100], [100, 100, 100], [0, 100, 100]]; // CCW

test("lengths and the closed area", () => {
  const s = stringStats(square, true);
  assert.equal(s.length2d, 400); assert.equal(s.area, 10000); assert.ok(s.ccw);
  const open = stringStats([[0, 0, 0], [30, 40, 0], [30, 40, 10]], false);
  assert.equal(open.length2d, 50); assert.ok(Math.abs(open.length3d - 60) < 1e-9); assert.equal(open.area, 0);
});

test("an offset of a closed string goes outward whatever its winding; an open one to the right of travel", () => {
  for (const ring of [square, [...square].reverse()]) {
    const out = offsetString(ring, 10, true), st = stringStats(out, true);
    assert.equal(out.length, 4);
    assert.ok(Math.abs(st.area - 120 * 120) < 1e-6, `area ${st.area}`);
    assert.ok(out.every((p) => p[2] === 100));
    const inn = stringStats(offsetString(ring, -10, true), true);
    assert.ok(Math.abs(inn.area - 80 * 80) < 1e-6);
  }
  const line = offsetString([[0, 0, 5], [100, 0, 5]], 10, false); // travelling east: right is south
  assert.deepEqual(line.map((p) => p.map((v) => Math.round(v))), [[0, -10, 5], [100, -10, 5]]);
  // a right-angle turn gets a mitre: one corner point
  const L = offsetString([[0, 0, 0], [100, 0, 0], [100, 100, 0]], 10, false);
  assert.equal(L.length, 3); assert.deepEqual(L[1].map(Math.round), [110, -10, 0]);
});

test("join picks the nearest ends, split cuts at a vertex", () => {
  const a = [[0, 0, 0], [10, 0, 0]], b = [[30, 0, 0], [10, 0, 0]]; // b runs back towards a's end
  assert.deepEqual(joinStrings(a, b), [[0, 0, 0], [10, 0, 0], [30, 0, 0]]);
  const [p, q] = splitString([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]], 2);
  assert.equal(p.length, 3); assert.equal(q.length, 2); assert.equal(splitString([[0, 0, 0], [1, 0, 0]], 1), null);
});

test("typed and snapped vertices", () => {
  const p = fromDistanceBearing([1000, 2000, 500], { distance: 100, bearing: 90, grade: -10 });
  assert.deepEqual(p.map((v) => +v.toFixed(6)), [1100, 2000, 490]);
  assert.deepEqual(orthoPoint([0, 0, 0], [80, 20, 7]).map((v) => +v.toFixed(6)), [+Math.hypot(80, 20).toFixed(6), 0, 7]);
  assert.deepEqual(snapToGrid([1003.2, 1997.9, 5], 10), [1000, 2000, 5]);
  assert.deepEqual(nearestPoint([1, 1, 1], [[5, 5, 5], [1.5, 1, 1]], 2), [1.5, 1, 1]);
  assert.equal(nearestPoint([1, 1, 1], [[5, 5, 5]], 2), null);
  const on = nearestOnString(square, [50, -3, 0], true);
  assert.equal(on.segment, 0); assert.deepEqual(on.point.map(Math.round), [50, 0, 100]);
});

test("DXF out and back in keeps the vertices, Z, names and the closed flag", () => {
  const strings = [{ name: "crest", color: "#ff0000", closed: true, vertices: square }, { name: "ramp", color: "#00ff00", closed: false, vertices: [[0, 0, 100], [50, 10, 95], [120, 40, 90]] }];
  const dxf = buildDXF({ features: stringFeatures(strings), geomType: "line", layerOf: (f) => f.attributes.name });
  const back = stringsFromDxf(dxf, { zDefault: 0, baseName: "test" });
  assert.equal(back.strings.length, 2); assert.ok(back.has3D);
  const crest = back.strings.find((s) => /crest/.test(s.name)), ramp = back.strings.find((s) => /ramp/.test(s.name));
  assert.ok(crest.closed); assert.equal(crest.vertices.length, 4); assert.equal(crest.vertices[2][2], 100);
  assert.ok(!ramp.closed); assert.equal(ramp.vertices.length, 3); assert.equal(ramp.vertices[2][2], 90);
  assert.equal(stringRows(strings).length, 7);
});

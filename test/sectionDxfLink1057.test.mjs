// TASKS.csv #1057 — GeoStrix's own section-string DXF must read back as one linkable body per name
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionStringsToDXF, sectionStringsToRows } from "../src/lib/sectionExport.js";
import { parseDXF, buildDXF } from "../src/lib/dxf.js";
import { placeDxfStrings } from "../src/lib/explicitDxf.js";

// three east-west sections at 6200N / 6300N / 6400N, VeinA outlined on each
const E0 = 600000, N = [6200, 6300, 6400];
const sections = N.map((n) => ({ id: `s${n}`, name: `${n}N`, ax: E0, ay: 7000000 + n, bx: E0 + 400, by: 7000000 + n, corridor: 25,
  contacts: [{ id: `c${n}`, unit: "VeinA", kind: "outline", points: [
    { l: 100, x: E0 + 100, y: 7000000 + n, z: 900, tie: true }, { l: 140, x: E0 + 140, y: 7000000 + n, z: 900 },
    { l: 140, x: E0 + 140, y: 7000000 + n, z: 860 }, { l: 100, x: E0 + 100, y: 7000000 + n, z: 860 }] }] }));

test("#1057 exported outlines re-import under one body name", () => {
  const back = parseDXF(sectionStringsToDXF(sections).dxf);
  assert.deepEqual(back.layers, ["VeinA", "VeinA", "VeinA"]);
  const r = placeDxfStrings(back, sections);
  assert.equal(r.outlines.length, 3);
  assert.deepEqual([...new Set(r.outlines.map((o) => o.layer))], ["VeinA"]);
  assert.deepEqual(r.outlines.map((o) => o.sectionName), ["6200N", "6300N", "6400N"]);
});

test("#1057 a file exported before the change (section_outline_body layers) still links", () => {
  const features = sections.map((s) => ({ geometry: [...s.contacts[0].points, s.contacts[0].points[0]].map((p) => [p.x, p.y, p.z]), attributes: { hole_id: `${s.name}_outline_VeinA` } }));
  const r = placeDxfStrings(parseDXF(buildDXF({ features, geomType: "line" })), sections);
  assert.deepEqual(r.outlines.map((o) => o.layer), ["VeinA", "VeinA", "VeinA"]);
});

test("#1057 the CSV carries the tie vertex, not on the closing repeat", () => {
  const rows = sectionStringsToRows([sections[0]]);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.tie), ["Y", "", "", "", ""]);
});

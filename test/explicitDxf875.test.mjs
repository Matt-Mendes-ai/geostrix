// TASKS.csv #875 — DXF interpretation strings placed into the explicit tools
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeDxfStrings } from "../src/lib/explicitDxf.js";
import { parseDXF } from "../src/lib/dxf.js";

const sections = [{ id: "s1", name: "N1000", ax: 0, ay: 1000, bx: 1000, by: 1000, corridor: 50 }, { id: "s2", name: "N1100", ax: 0, ay: 1100, bx: 1000, by: 1100, corridor: 50 }];

test("#875 closed strings on a section become outlines there; open 3D strings hard lines; points picks; 2D and off-section counted", () => {
  const parsed = {
    polylines: [
      [{ x: 100, y: 1002, z: 500 }, { x: 200, y: 999, z: 500 }, { x: 200, y: 1001, z: 450 }, { x: 100, y: 1000, z: 450 }], // closed, on N1000 (within 2 m)
      [{ x: 100, y: 1100, z: 500 }, { x: 300, y: 1100, z: 480 }], // open 3D
      [{ x: 50, y: 50, z: 10 }], // a point
      [{ x: 0, y: 0 }, { x: 10, y: 10 }], // 2D
      [{ x: 100, y: 1050, z: 500 }, { x: 200, y: 1050, z: 500 }, { x: 150, y: 1050, z: 450 }], // closed, halfway between sections
    ],
    layers: ["VeinA", "TopDACT", "PICKS", "0", "VeinB"], closed: [true, false, false, false, true],
  };
  const r = placeDxfStrings(parsed, sections);
  assert.equal(r.outlines.length, 1); assert.equal(r.outlines[0].sectionId, "s1"); assert.equal(r.outlines[0].layer, "VeinA");
  assert.ok(r.outlines[0].points.every((p) => p.y === 1000 && Math.abs(p.l - p.x) < 1e-9), "projected onto the section plane");
  assert.equal(r.hardLines.length, 1); assert.equal(r.hardLines[0].layer, "TopDACT");
  assert.deepEqual(r.picks, [{ x: 50, y: 50, z: 10, layer: "PICKS" }]);
  assert.equal(r.flat, 1); assert.equal(r.offSection, 1);
});

test("#875 a real DXF through parseDXF: a closed 3D POLYLINE on a section and a 3D LWPOLYLINE-free open string", () => {
  const dxf = ["0", "SECTION", "2", "ENTITIES",
    "0", "POLYLINE", "8", "Lens", "66", "1", "70", "9", // closed (1) + 3D polyline (8)
    "0", "VERTEX", "8", "Lens", "10", "100", "20", "1000", "30", "500", "70", "32",
    "0", "VERTEX", "8", "Lens", "10", "200", "20", "1000", "30", "500", "70", "32",
    "0", "VERTEX", "8", "Lens", "10", "150", "20", "1000", "30", "440", "70", "32",
    "0", "SEQEND",
    "0", "ENDSEC", "0", "EOF"].join("\n");
  const r = placeDxfStrings(parseDXF(dxf), sections);
  assert.equal(r.outlines.length, 1); assert.equal(r.outlines[0].layer, "Lens"); assert.equal(r.outlines[0].points.length, 3);
});

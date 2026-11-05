// TASKS.csv #1621 — contours export one polyline per line, with its level and its vertices' heights
import { test } from "node:test";
import assert from "node:assert/strict";
import { boundaryFeatures } from "../src/lib/overlayExport.js";
import { buildDXF } from "../src/lib/dxf.js";

const contour = { name: "Contours 10 m", kind: "boundary", useVertexZ: true, elevation: 0, contourLevels: [1470, 1480],
  closedFlags: [true, true],
  polylines: [[{ x: 0, y: 0, z: 1470 }, { x: 10, y: 0, z: 1470 }, { x: 10, y: 10, z: 1470 }, { x: 0, y: 0, z: 1470 }], [{ x: 0, y: 0, z: 1480 }, { x: 5, y: 5, z: 1480 }]] };

test("a contour boundary -> levelled polylines at their own heights", () => {
  const r = boundaryFeatures(contour);
  assert.equal(r.geomType, "polyline");
  assert.equal(r.features.length, 2);
  assert.equal(r.features[0].attributes.level, 1470); assert.equal(r.features[1].attributes.level, 1480);
  assert.equal(r.features[0].attributes.kind, "contour");
  assert.ok(r.features.every((f) => f.geometry.every((p) => p[2] === f.attributes.level)));
  const dxf = buildDXF({ features: r.features, geomType: r.geomType, layerOf: r.dxfLayerOf });
  assert.match(dxf, /Contours_10_m_1470|Contours 10 m_1470/); assert.match(dxf, /\n1480(\.0+)?\n/);
});

test("a plain boundary is unchanged: one polygon at its elevation", () => {
  const r = boundaryFeatures({ name: "Claim", polylines: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]], elevation: 1200 });
  assert.equal(r.geomType, "polygon"); assert.equal(r.features.length, 1); assert.equal(r.features[0].geometry[0][2], 1200);
});

// TASKS.csv #1103 — an explicit surface's extrapolated margin is marked in DXF / VTK / OMF exports
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { supportedFaces } from "../src/lib/explicitSupport.js";
import { exportSurfaceDXF } from "../src/lib/meshExport.js";
import { surfaceToVtk } from "../src/lib/vtkExport.js";
import { writeOMF } from "../src/lib/omfWriter.js";
import { parseOMF } from "../src/lib/omf.js";

// two triangles on z = 0: one inside the hull [0..10]^2, one reaching x = 30
const hull = { origin: [0, 0, 0], e1: [1, 0, 0], e2: [0, 1, 0], uv: [0, 0, 10, 0, 10, 10, 0, 10] };
const P = [1, 1, 0, 9, 1, 0, 5, 8, 0, 9, 1, 0, 30, 1, 0, 9, 8, 0];
const I = [0, 1, 2, 3, 4, 5];

test("#1103 per-face support: all three vertices inside the inputs' hull", () => {
  assert.deepEqual(Array.from(supportedFaces(P, I, hull)), [1, 0]);
  assert.equal(supportedFaces(P, I, null), null);
});

test("#1103 DXF: the extrapolated triangle on <layer>_EXTRAPOLATED", () => {
  const g = new THREE.BufferGeometry();
  // scene frame: (x, z, -y) of world, origin 0
  g.setAttribute("position", new THREE.Float32BufferAttribute(P.flatMap((_, i) => (i % 3 ? [] : [P[i], P[i + 2], -P[i + 1]])), 3));
  g.setIndex(I);
  const dxf = exportSurfaceDXF("Vein A", g, { x: 0, y: 0, z: 0 }, null, {}, { supported: supportedFaces(P, I, hull) });
  const layers = [...dxf.matchAll(/0\n3DFACE\n8\n([^\n]+)\n/g)].map((m) => m[1]);
  assert.equal(layers.length, 2);
  assert.ok(layers[1] === `${layers[0]}_EXTRAPOLATED`, layers.join(" | "));
});

test("#1103 VTK cell data and OMF face data 'supported'", async () => {
  const verts = [[1, 1, 0], [9, 1, 0], [5, 8, 0], [9, 1, 0], [30, 1, 0], [9, 8, 0]];
  const vtk = surfaceToVtk("Vein A", verts, I, "", supportedFaces(P, I, hull));
  assert.match(vtk, /CELL_DATA 2\nSCALARS supported int 1\nLOOKUP_TABLE default\n1\n0\n$/);
  const bytes = await writeOMF({ elements: [{ type: "surface", name: "Vein A", vertices: P, triangles: I, data: [{ name: "supported", values: [1, 0], location: "faces" }] }] });
  const p = await parseOMF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const json = JSON.stringify(p.elements[0].attributes || p.elements[0]);
  assert.match(json, /supported/);
});

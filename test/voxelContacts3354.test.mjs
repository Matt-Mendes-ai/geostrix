// TASKS.csv #3354 (Matt: a resistivity voxel, 60 classes, froze as its opacity rose and showed 'just an outside shell depending on the
// angle of view') — contacts are between classes (banded to 12), each drawn once; the face mesh is re-sorted back to front; a large
// model's mesh serves every opacity, so crossing 1 changes the material only. Synthetic cells.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { rectilinearGrid, buildExposedFaces, voxelBands } from "../src/lib/voxelFaces.js";
import { sortFacesBackToFront } from "../src/lib/viewer/voxelSort.js";

// a smooth field over 20 x 20 x 10 blocks: every neighbour has a different value, as in an inversion
const cells = [];
for (let k = 0; k < 10; k++) for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) cells.push({ x: i * 10 + 5, y: j * 10 + 5, z: -k * 10 - 5, dx: 10, dy: 10, dz: 10, value: 10 ** (1 + i / 20 + j / 40 + k / 30) });
const stops = Array.from({ length: 60 }, (_, n) => ({ value: 10 ** (1 + (2.5 * n) / 59), color: "#808080" }));
const model = { stops, colorMode: "discrete" }, G = rectilinearGrid(cells), o = { x: 0, y: 0, z: 0 }, grey = () => [128, 128, 128];

test("contacts between classes, banded to at most 12, each once: far fewer faces than one per pair of different values", () => {
  const skin = buildExposedFaces(cells, G, o, grey).faces;
  const raw = buildExposedFaces(cells, G, o, grey, { boundaries: true }).faces;
  const all60 = buildExposedFaces(cells, G, o, grey, { boundaries: true, classOf: voxelBands(model, 60) }).faces;
  const bands = buildExposedFaces(cells, G, o, grey, { boundaries: true, classOf: voxelBands(model) }).faces;
  assert.equal(skin, 2 * (400 + 200 + 200));
  assert.equal(raw - skin, 19 * 20 * 10 + 20 * 19 * 10 + 20 * 20 * 9, "raw values: every inner pair, once (was twice)");
  assert.ok(all60 < raw && bands < all60, `${raw} > ${all60} > ${bands}`);
  const b = voxelBands(model);
  assert.equal(b(1), 0); assert.equal(b(10), 0); assert.equal(b(10 ** 3.5), 11); assert.equal(new Set(stops.map((s) => b(s.value))).size, 12);
  assert.equal(voxelBands({ stops: [] }), null);
});

test("the face mesh re-sorted back to front: the quad farthest from the camera first", () => {
  const fm = buildExposedFaces(cells.slice(0, 40), rectilinearGrid(cells.slice(0, 40)), o, grey);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(fm.positions, 3)); g.setIndex(new THREE.BufferAttribute(fm.indices, 1));
  const mesh = new THREE.Mesh(g), cam = new THREE.Vector3(1000, 0, 0);
  assert.equal(sortFacesBackToFront(mesh, cam), true);
  const ia = g.index.array, p = fm.positions, cx = (q) => (p[ia[q * 6] * 3] + p[ia[q * 6 + 2] * 3]) / 2;
  const n = ia.length / 6;
  assert.ok(cx(0) <= cx(n - 1), "far (low x) first, near (high x) last");
  for (let q = 0; q < n; q++) assert.equal(ia[q * 6 + 3], ia[q * 6], "each quad keeps its two triangles");
});

test("wiring: the bands and the sort in the view; a large model's mesh serves every opacity", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /\{ boundaries: bigModel && model\.colorMode === "discrete", classOf: voxelBands\(model\) \}/);
  assert.match(v, /if \(bigFaces\) faceLook\(prev, op\); else prev\.material\.opacity = op;/);
  assert.match(v, /voxelGeometryUnchanged\(prev\.userData\.srcModel, model, bigFaces\)/);
  assert.match(v, /if \(mesh\.userData\.faceSort && mesh\.material\.transparent && mesh\.visible\) \{ didWork = sortFacesBackToFront\(mesh, camera\.position\) \|\| didWork; return; \}/);
});

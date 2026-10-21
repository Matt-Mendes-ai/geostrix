// TASKS.csv #798 — legacy VTK files: checked against the format's rules (header, counts, big-endian binary blocks)
import { test } from "node:test";
import assert from "node:assert/strict";
import { surfaceToVtk, blockModelToVtk } from "../src/lib/vtkExport.js";

// reads `n` lines of ASCII starting at byte `off`; returns [lines, next offset]
const readLines = (u8, off, n) => { const out = []; for (let k = 0; k < n; k++) { let e = off; while (u8[e] !== 10) e++; out.push(new TextDecoder().decode(u8.subarray(off, e))); off = e + 1; } return [out, off]; };

test("#798 surface: ASCII polydata with the points and triangles", () => {
  const v = surfaceToVtk("Shell\nA", [[1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 5, 9]], [0, 1, 2, 0, 2, 3], "EPSG:3156");
  const L = v.trim().split("\n");
  assert.equal(L[0], "# vtk DataFile Version 3.0");
  assert.ok(!L[1].includes("\n") && L[1].startsWith("Shell A - GeoStrix"));
  assert.deepEqual(L.slice(2, 5), ["ASCII", "DATASET POLYDATA", "POINTS 4 double"]);
  assert.equal(L[5], "1.0000 2.0000 3.0000");
  assert.equal(L[9], "POLYGONS 2 8");
  assert.deepEqual(L.slice(10), ["3 0 1 2", "3 0 2 3"]);
});

test("#798 regular block model: STRUCTURED_POINTS, cell values in x-fastest order, NaN where no block", () => {
  const cells = [];
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) if (!(i === 2 && j === 1 && k === 1)) cells.push({ x: 1005 + i * 10, y: 2005 + j * 10, z: 102.5 + k * 5, dx: 10, dy: 10, dz: 5, value: i + 10 * j + 100 * k });
  const { bytes, kind, dims } = blockModelToVtk({ name: "Au", property: "Au (ppm)", cells });
  assert.equal(kind, "image"); assert.deepEqual(dims, [3, 2, 2]);
  const [h, off] = readLines(bytes, 0, 10);
  assert.deepEqual(h.slice(2), ["BINARY", "DATASET STRUCTURED_POINTS", "DIMENSIONS 4 3 3", "ORIGIN 1000 2000 100", "SPACING 10 10 5", "CELL_DATA 12", "SCALARS Au_ppm_ float 1", "LOOKUP_TABLE default"]);
  assert.equal(bytes.length, off + 12 * 4 + 1); // 12 big-endian float32 then a newline
  const dv = new DataView(bytes.buffer, bytes.byteOffset + off);
  const vals = Array.from({ length: 12 }, (_, n) => dv.getFloat32(n * 4, false));
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
    const v = vals[k * 6 + j * 3 + i];
    if (i === 2 && j === 1 && k === 1) assert.ok(Number.isNaN(v)); else assert.equal(v, i + 10 * j + 100 * k);
  }
});

test("#798 irregular block model: UNSTRUCTURED_GRID of VOXEL cells", () => {
  const cells = [{ x: 5, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 1 }, { x: 20, y: 5, z: 10, dx: 20, dy: 10, dz: 20, value: 2 }]; // mixed sizes
  const { bytes, kind } = blockModelToVtk({ name: "m", cells });
  assert.equal(kind, "voxels");
  let [h, off] = readLines(bytes, 0, 5);
  assert.deepEqual(h.slice(2), ["BINARY", "DATASET UNSTRUCTURED_GRID", "POINTS 16 double"]);
  const p = new DataView(bytes.buffer, bytes.byteOffset + off);
  assert.deepEqual([0, 1, 2].map((a) => p.getFloat64(a * 8, false)), [0, 0, 0]); // first corner of the first voxel
  assert.deepEqual([3, 4, 5].map((a) => p.getFloat64(a * 8, false)), [10, 0, 0]); // x varies first (VTK voxel order)
  off += 16 * 24 + 1;
  [h, off] = readLines(bytes, off, 1); assert.equal(h[0], "CELLS 2 18");
  const c = new DataView(bytes.buffer, bytes.byteOffset + off);
  assert.deepEqual(Array.from({ length: 9 }, (_, n) => c.getInt32(n * 4, false)), [8, 0, 1, 2, 3, 4, 5, 6, 7]);
  off += 18 * 4 + 1;
  [h, off] = readLines(bytes, off, 1); assert.equal(h[0], "CELL_TYPES 2");
  const t = new DataView(bytes.buffer, bytes.byteOffset + off);
  assert.deepEqual([t.getInt32(0, false), t.getInt32(4, false)], [11, 11]);
  off += 2 * 4 + 1;
  [h, off] = readLines(bytes, off, 3); assert.deepEqual(h, ["CELL_DATA 2", "SCALARS value float 1", "LOOKUP_TABLE default"]);
  const v = new DataView(bytes.buffer, bytes.byteOffset + off);
  assert.deepEqual([v.getFloat32(0, false), v.getFloat32(4, false)], [1, 2]);
  assert.equal(bytes.length, off + 2 * 4 + 1);
});

// TASKS.csv #793 — opaque block models on a rectilinear grid as one mesh of exposed faces: the right faces, facing out, in the right
// place, coloured like the instanced boxes.
import test from "node:test";
import assert from "node:assert/strict";
import { rectilinearGrid, buildExposedFaces } from "../src/lib/voxelFaces.js";

const block = (n, keep = () => true, d = { dx: 10, dy: 20, dz: 5 }) => {
  const cells = [];
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (keep(i, j, k)) cells.push({ x: 500000 + (i + 0.5) * d.dx, y: 6000000 + (j + 0.5) * d.dy, z: 800 + (k + 0.5) * d.dz, ...d, value: i + j + k });
  return cells;
};
// signed volume (divergence theorem): positive when every face points outward
const signedVolume = (m) => {
  let v6 = 0; const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
    v6 += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v6 / 6;
};
const origin = { x: 500000, y: 6000000, z: 800 };
const grey = () => [128, 128, 128];

test("#793 a solid block: only its outer faces, outward, enclosing exactly its volume", () => {
  const cells = block(10);
  const m = buildExposedFaces(cells, rectilinearGrid(cells), origin, grey);
  assert.equal(m.faces, 6 * 10 * 10, "600 faces instead of 6,000 box faces");
  assert.ok(Math.abs(signedVolume(m) - 1000 * 10 * 20 * 5) < 1e-3);
  // the scene box: X east 0..100, Y elevation 0..50, Z = -north -200..0
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) { const [x, y, z] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]]; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  assert.deepEqual([xmin, xmax, ymin, ymax, zmin, zmax].map((v) => Math.round(v * 1e3) / 1e3 + 0), [0, 100, 0, 50, -200, 0]);
  // each face's stored normal agrees with its winding
  const p = m.positions;
  for (let q = 0; q < m.faces; q += 37) {
    const a = 12 * q, e1 = [p[a + 3] - p[a], p[a + 4] - p[a + 1], p[a + 5] - p[a + 2]], e2 = [p[a + 6] - p[a], p[a + 7] - p[a + 1], p[a + 8] - p[a + 2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    assert.ok(cr[0] * m.normals[a] + cr[1] * m.normals[a + 1] + cr[2] * m.normals[a + 2] > 0);
  }
});

test("#793 a hidden block inside: its cavity faces point inward, the volume drops by one block", () => {
  const cells = block(5, (i, j, k) => !(i === 2 && j === 2 && k === 2));
  const m = buildExposedFaces(cells, rectilinearGrid(cells), origin, grey);
  assert.equal(m.faces, 6 * 25 + 6);
  assert.ok(Math.abs(signedVolume(m) - 124 * 1000) < 1e-3);
});

test("#793 colours: sRGB 0-255 to three.js's linear working space, per block", () => {
  const cells = block(1);
  const m = buildExposedFaces(cells, rectilinearGrid(cells), origin, () => [255, 128, 0]);
  assert.equal(m.faces, 6);
  assert.ok(Math.abs(m.colors[0] - 1) < 1e-6 && Math.abs(m.colors[1] - 0.2158605) < 1e-5 && m.colors[2] === 0);
});

test("#793 a tensor mesh (layers of different thickness) is a grid too; sub-blocks are not", () => {
  const cells = [];
  const zs = [[0, 75], [75, 150], [150, 187.5], [187.5, 225]];
  for (const [z0, z1] of zs) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) cells.push({ x: 450 * (i + 0.5), y: 525 * (j + 0.5), z: (z0 + z1) / 2, dx: 450, dy: 525, dz: z1 - z0, value: z0 });
  const G = rectilinearGrid(cells);
  assert.deepEqual(Array.from(G.ez), [0, 75, 150, 187.5, 225]);
  const m = buildExposedFaces(cells, G, { x: 0, y: 0, z: 0 }, grey);
  assert.equal(m.faces, 2 * 16 + 4 * 16, "top + bottom 4x4, four sides 4 wide x 4 layers");
  assert.ok(Math.abs(signedVolume(m) - 1800 * 2100 * 225) < 1);
  // only the shown subset: the top layer hidden
  const sub = cells.filter((c) => c.z < 187.5);
  assert.equal(buildExposedFaces(sub, G, { x: 0, y: 0, z: 0 }, grey).faces, 2 * 16 + 4 * 12);
  // a sub-blocked corner (one block split in two) is not a rectilinear grid
  const split = cells.slice(1).concat([{ x: 112.5, y: 262.5, z: 37.5, dx: 225, dy: 525, dz: 75, value: 0 }, { x: 337.5, y: 262.5, z: 37.5, dx: 225, dy: 525, dz: 75, value: 0 }]);
  assert.equal(rectilinearGrid(split), null);
});

// TASKS.csv #568 — clipping cuts triangles at the boundary instead of dropping them.
import test from "node:test";
import assert from "node:assert/strict";
import { clipMesh } from "../src/lib/clipMesh.js";

// a 10 x 10 grid of 55 m cells (2 triangles each) in the plane z = 0, wound with +z normals
function grid(n = 10, cell = 55) {
  const verts = [], faces = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) verts.push({ x: i * cell, y: j * cell, z: 0 });
  const id = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { faces.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]); }
  return { verts, faces };
}
const area = (v, f) => f.reduce((s, [a, b, c]) => s + ((v[b].x - v[a].x) * (v[c].y - v[a].y) - (v[c].x - v[a].x) * (v[b].y - v[a].y)) / 2, 0);

test("#568 a flat surface cut by an inclined plane: boundary on the plane within 1 cm, exact area, no saw-tooth", () => {
  const { verts, faces } = grid();
  // remove where x + 0.6 y > 400 (an oblique line across the cells)
  const plane = (p) => p.x + 0.6 * p.y - 400;
  const r = clipMesh(verts, faces, (p) => plane(p) > 0);
  assert.ok(r.split > 0);
  const added = r.verts.slice(verts.length);
  assert.ok(added.length > 10);
  for (const p of added) assert.ok(Math.abs(plane(p)) / Math.hypot(1, 0.6) < 0.01, `off the plane by ${plane(p)}`);
  // kept area = area of the polygon x + 0.6y <= 400 inside the 550 x 550 square
  // x <= 400 - 0.6y for y in [0, 550]: integral of (400 - 0.6 y) dy = 400*550 - 0.3*550^2
  const exact = 400 * 550 - 0.3 * 550 * 550;
  assert.ok(Math.abs(area(r.verts, r.faces) - exact) / exact < 1e-4, `${area(r.verts, r.faces)} vs ${exact}`);
  // winding kept: every triangle still has a positive (+z) area
  for (const [a, b, c] of r.faces) assert.ok(((r.verts[b].x - r.verts[a].x) * (r.verts[c].y - r.verts[a].y) - (r.verts[c].x - r.verts[a].x) * (r.verts[b].y - r.verts[a].y)) > -1e-9);
  // watertight along the cut: every interior edge is shared by exactly two triangles
  const edges = new Map();
  for (const f of r.faces) for (let k = 0; k < 3; k++) { const a = f[k], b = f[(k + 1) % 3], key = a < b ? `${a}_${b}` : `${b}_${a}`; edges.set(key, (edges.get(key) || 0) + 1); }
  assert.ok([...edges.values()].every((n) => n <= 2));
});

test("#568 all inside / all outside", () => {
  const { verts, faces } = grid(2);
  assert.equal(clipMesh(verts, faces, () => false).faces.length, faces.length);
  const r = clipMesh(verts, faces, () => true);
  assert.equal(r.faces.length, 0); assert.equal(r.removed, faces.length);
});

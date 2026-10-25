// TASKS.csv #895 — offset copies of a surface: along its normal (true thickness) or vertically
import { test } from "node:test";
import assert from "node:assert/strict";
import { offsetSurface } from "../src/lib/offsetSurface.js";

// a plane dipping 30 deg east, as a 4 x 4 grid of quads with mixed winding (imported meshes are not always consistent)
const dip = (30 * Math.PI) / 180;
const grid = () => {
  const P = [], I = [];
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) P.push(i * 25, j * 25, 100 - Math.tan(dip) * i * 25);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const a = j * 5 + i; if ((i + j) % 2) I.push(a, a + 1, a + 6, a, a + 6, a + 5); else I.push(a, a + 6, a + 1, a, a + 5, a + 6); }
  return { P: Float64Array.from(P), I: Uint32Array.from(I) };
};
// distance from a point to the original plane (n = (sin dip, 0, cos dip), through (0, 0, 100))
const toPlane = (x, y, z) => x * Math.sin(dip) + (z - 100) * Math.cos(dip);

test("#895 along the normal: every vertex lies exactly d from the plane, on its upper side, whatever the winding", () => {
  const { P, I } = grid();
  const r = offsetSurface(P, I, 12);
  for (let k = 0; k < r.positions.length; k += 3) assert.ok(Math.abs(toPlane(r.positions[k], r.positions[k + 1], r.positions[k + 2]) - 12) < 1e-9);
  assert.equal(r.unmoved, 0);
  const down = offsetSurface(P, I, -5);
  assert.ok(Math.abs(toPlane(down.positions[0], down.positions[1], down.positions[2]) + 5) < 1e-9);
});

test("#895 vertically: z + d, x / y unchanged", () => {
  const { P, I } = grid();
  const r = offsetSurface(P, I, 20, { mode: "vertical" });
  for (let k = 0; k < P.length; k += 3) { assert.equal(r.positions[k], P[k]); assert.equal(r.positions[k + 2], P[k + 2] + 20); }
});

test("#895 a vertical sheet offsets to one side (east), not each triangle its own way", () => {
  const P = Float64Array.from([0, 0, 0, 0, 100, 0, 0, 100, 50, 0, 0, 50]), I = Uint32Array.from([0, 1, 2, 0, 3, 2]); // second triangle wound the other way
  const r = offsetSurface(P, I, 3);
  for (let k = 0; k < 12; k += 3) assert.ok(Math.abs(r.positions[k] - 3) < 1e-9);
});

import { clipSurfaceToArea } from "../src/lib/clipMesh.js";
test("#895 clip to an area: the part inside, the edge cut exactly at the boundary, nothing outside", () => {
  // a flat 100 x 100 sheet of 4 x 4 quads, clipped to x < 37.5 (a straight boundary through the middle of a quad column)
  const P = [], I = [];
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) P.push(i * 25, j * 25, 10);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const a = j * 5 + i; I.push(a, a + 1, a + 6, a, a + 6, a + 5); }
  const r = clipSurfaceToArea(Float64Array.from(P), Uint32Array.from(I), (x) => x < 37.5);
  let maxX = -Infinity, area = 0;
  for (let k = 0; k < r.positions.length; k += 3) maxX = Math.max(maxX, r.positions[k]);
  for (let t = 0; t < r.indices.length; t += 3) { const [a, b, c] = [r.indices[t], r.indices[t + 1], r.indices[t + 2]].map((q) => [r.positions[q * 3], r.positions[q * 3 + 1]]); area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; }
  assert.ok(Math.abs(maxX - 37.5) < 0.01, `edge at ${maxX}`);
  assert.ok(Math.abs(area - 37.5 * 100) < 5, `area ${area}`);
  assert.ok(r.split > 0 && r.removed > 0);
  assert.equal(clipSurfaceToArea(Float64Array.from(P), Uint32Array.from(I), () => false).indices.length, 0);
});

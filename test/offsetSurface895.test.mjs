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

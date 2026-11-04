// TASKS.csv #1950 / #1951 (Vulcan review) — a solid clipped by a surface, and the booleans of two solids, with exact volumes
import { test } from "node:test";
import assert from "node:assert/strict";
import { clipSolidBySurface, solidBoolean, terrainPatchMesh, meanNormalZ, meshBounds } from "../src/lib/solidBoolean.js";

const box = (x0, y0, z0, x1, y1, z1) => {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { positions: Float64Array.from(v.flat()), indices: Uint32Array.from(f.flat()) };
};
// a horizontal surface at z, facing up, well beyond the boxes
const plane = (z) => ({ positions: Float64Array.from([-100, -100, z, 100, -100, z, 100, 100, z, -100, 100, z]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]) });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("a box clipped by a horizontal plane: the part above and the part below, volumes exact", () => {
  const A = box(0, 0, 0, 20, 20, 20);
  assert.equal(meanNormalZ(plane(5).positions, plane(5).indices), 1);
  const above = clipSolidBySurface(A, plane(5), { keep: "positive" });
  assert.ok(above.ok && !above.empty);
  near(above.volumeM3, 20 * 20 * 15, 60, "above"); // 6,000 m3 to about a percent (refined, then cut on the edges)
  assert.ok(above.capTriangles > 0, "a cap closes the cut");
  const below = clipSolidBySurface(A, plane(5), { keep: "negative" });
  near(below.volumeM3, 20 * 20 * 5, 60, "below");
  near(above.volumeM3 + below.volumeM3, 8000, 100, "the two parts make the box");
  // a plane missing the box: nothing to cut, the whole box on the kept side or nothing
  const miss = clipSolidBySurface(A, plane(50), { keep: "negative" });
  assert.ok(miss.ok && miss.unchanged && Math.abs(miss.volumeM3 - 8000) < 1e-6);
  assert.equal(clipSolidBySurface(A, plane(50), { keep: "positive" }).empty, true);
});

test("two overlapping boxes: intersection, union and difference", () => {
  const A = box(0, 0, 0, 20, 20, 20), B = box(10, 10, 10, 30, 30, 30);
  const i = solidBoolean(A, B, "intersection"), u = solidBoolean(A, B, "union"), d = solidBoolean(A, B, "difference");
  near(i.volumeM3, 1000, 30, "intersection");
  near(u.volumeM3, 15000, 150, "union");
  near(d.volumeM3, 7000, 100, "difference");
  assert.ok(i.components >= 1 && u.components >= 1);
  // boxes apart
  const C = box(50, 50, 50, 60, 60, 60);
  assert.equal(solidBoolean(A, C, "intersection").empty, true);
  near(solidBoolean(A, C, "union").volumeM3, 9000, 1e-6, "union apart");
  near(solidBoolean(A, C, "difference").volumeM3, 8000, 1e-6, "difference apart");
  // one inside the other
  const small = box(5, 5, 5, 10, 10, 10);
  near(solidBoolean(A, small, "difference").volumeM3, 8000 - 125, 1e-3, "a hole inside");
  near(solidBoolean(A, small, "intersection").volumeM3, 125, 1e-3, "the small one");
  assert.equal(solidBoolean(small, A, "difference").empty, true, "nothing left");
  // an open cutter is refused
  assert.equal(solidBoolean(A, plane(5), "intersection").ok, false);
});

test("a terrain patch: a grid through groundAt, facing up, holes where the terrain has no data", () => {
  const g = (x, y) => (x > 90 ? NaN : 100 + 0.1 * x + 0.05 * y);
  const m = terrainPatchMesh(g, { x0: 0, y0: 0, x1: 100, y1: 50 }, 20);
  assert.ok(m && m.indices.length > 0 && m.missing > 0);
  assert.equal(meanNormalZ(m.positions, m.indices), 1);
  const A = box(10, 10, 95, 40, 40, 115); // straddles the ground at ~101-106 m
  const under = clipSolidBySurface(A, m, { keep: "negative" }), over = clipSolidBySurface(A, m, { keep: "positive" });
  assert.ok(under.ok && over.ok && under.volumeM3 > 0 && over.volumeM3 > 0);
  near(under.volumeM3 + over.volumeM3, 30 * 30 * 20, 200, "ground splits the box");
  const b = meshBounds(A.positions, 5);
  assert.deepEqual([b.x0, b.y0, b.z0, b.x1, b.y1, b.z1], [5, 5, 90, 45, 45, 120]);
});

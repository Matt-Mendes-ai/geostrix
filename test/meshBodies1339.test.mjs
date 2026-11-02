import { test } from "node:test";
import assert from "node:assert/strict";
import { meshBodies, keepLargestBody } from "../src/lib/meshBodies.js";

const V = Array.from({ length: 10 }, (_, i) => [i, 0, 0]);

test("counts the bodies and the largest one's share of the triangles", () => {
  const b = meshBodies([[0, 1, 2], [1, 2, 3], [2, 3, 4], [5, 6, 7]]);
  assert.equal(b.count, 2);
  assert.equal(b.largestShare, 0.75);
  assert.equal(meshBodies([]).count, 0);
});

test("triangles that share only one vertex are one body", () => {
  assert.equal(meshBodies([[0, 1, 2], [2, 3, 4]]).count, 1);
});

test("keeps the largest body and renumbers its vertices", () => {
  const r = keepLargestBody(V, [[5, 6, 7], [0, 1, 2], [1, 2, 3], [8, 9, 5]]);
  // 5-6-7 and 8-9-5 share vertex 5: two triangles each side, the first body found stays
  assert.equal(r.removedBodies, 1);
  assert.equal(r.faces.length, 2);
  assert.equal(r.vertices.length, Math.max(...r.faces.flat()) + 1);
  r.faces.flat().forEach((i) => assert.ok(r.vertices[i]));
});

test("a single body comes back as it was", () => {
  const f = [[0, 1, 2], [1, 2, 3]];
  const r = keepLargestBody(V, f);
  assert.equal(r.removedBodies, 0);
  assert.equal(r.faces, f);
  assert.equal(r.vertices, V);
});

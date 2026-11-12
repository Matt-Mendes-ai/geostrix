// TASKS.csv #2633 (Matt 2026-11-11, from the OpenGeode-Inspector review) — validateSolid now also counts degenerate triangles, isolated
// vertices, non-manifold (bow-tie) vertices and coincident vertices. Fixtures built by hand (the inspector itself would be a download:
// not installed); the expected counts are worked out below each one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSolid, meshDefects, isValidSolid } from "../src/lib/meshValidate.js";

// a closed, outward cube on 8 shared vertices
const CUBE_P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const CUBE_I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
// a closed tetrahedron (outward), apex at index 3
const tet = (o, s, flip = false) => ({ P: [o[0], o[1], o[2], o[0] + s, o[1], o[2], o[0], o[1] + s, o[2], o[0], o[1], o[2] + s], I: flip ? [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2] : [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] });

test("a clean cube: no defect, and a valid solid as before", () => {
  const v = validateSolid(new Float64Array(CUBE_P), new Uint32Array(CUBE_I));
  assert.deepEqual([v.degenerateTriangles, v.isolatedVertices, v.nonManifoldVertices, v.coincidentVertices], [0, 0, 0, 0]);
  assert.equal(isValidSolid(v), true);
});

test("a bow-tie: two tetrahedra sharing one vertex - every edge in two triangles, one non-manifold vertex", () => {
  const a = tet([0, 0, 0], 1), b = tet([1, 0, 0], 1);
  // b's corner 0 is a's corner 1 (1,0,0): share that vertex instead of repeating it
  const P = [...a.P, ...b.P.slice(3)], I = [...a.I, ...b.I.map((k) => (k === 0 ? 1 : k + 3))];
  const v = validateSolid(new Float64Array(P), new Uint32Array(I));
  assert.equal(v.openEdges, 0); assert.equal(v.nonManifoldEdges, 0);
  assert.equal(v.nonManifoldVertices, 1);
  assert.deepEqual(v.firstNonManifoldVertex, [1, 0, 0]);
});

test("a sliver and a repeated index are degenerate; an unused vertex is isolated", () => {
  const P = [...CUBE_P, 5, 5, 5, 0.5, 0, 0]; // 8: unused; 9: on the edge 0-1
  const I = [...CUBE_I, 0, 1, 9, 2, 2, 3]; // a zero-area triangle and one with a repeated index
  const d = meshDefects(new Float64Array(P), new Uint32Array(I));
  assert.equal(d.degenerateTriangles, 2);
  assert.equal(d.isolatedVertices, 1);
});

test("an unwelded cube (every face its own 4 vertices) reads as open edges, and the repeats say why", () => {
  const P = [], I = [];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  for (const f of faces) { const base = P.length / 3; for (const k of f) P.push(CUBE_P[3 * k], CUBE_P[3 * k + 1], CUBE_P[3 * k + 2]); I.push(base, base + 1, base + 2, base, base + 2, base + 3); }
  const v = validateSolid(new Float64Array(P), new Uint32Array(I));
  assert.ok(v.openEdges > 0);
  assert.equal(v.coincidentVertices, 24 - 8, "24 face vertices on 8 places");
});

test("the Solid blocks panel says them beside the solid, without blocking it", () => {
  const p = readFileSync(new URL("../src/components/SurfaceSolidsPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const defects = v && !broken \? \[v\.nonManifoldVertices && tr\(/);
  assert.match(p, /solids\.filter\(\(it\) => it\.defects\?\.length\)\.map\(/);
  const m = readFileSync(new URL("../src/lib/meshValidate.js", import.meta.url), "utf8");
  assert.match(m, /export const isValidSolid = \(v\) => v\.openEdges === 0 && v\.nonManifoldEdges === 0 && v\.windingConflicts === 0 && v\.selfIntersectingPairs === 0;/, "the verdict is unchanged");
});

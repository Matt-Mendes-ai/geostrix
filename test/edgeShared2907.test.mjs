// TASKS.csv #2907 (WA iron review) — two closed blocks of a unit touching along one edge (that edge used by 4 faces) are a closed shell with a
// volume, not 'open (1 open edge)'; an odd use count is still a hole.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { isMeshClosed } from "../src/lib/meshQuery.js";
import { computeMeshVolume } from "../src/lib/volumetrics.js";

// a unit cube's 12 outward triangles on the vertex indices v[0..7] (x, y, z bits)
const cubeTris = (v) => [[0, 2, 1], [1, 2, 3], [4, 5, 6], [5, 7, 6], [0, 1, 4], [1, 5, 4], [2, 6, 3], [3, 6, 7], [0, 4, 2], [2, 4, 6], [1, 3, 5], [3, 7, 5]].flatMap((t) => t.map((k) => v[k]));
function twoCubesOnAnEdge() {
  const pos = [], idx = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const a = [], b = [];
  for (let k = 0; k < 8; k++) a.push(idx(k & 1, (k >> 1) & 1, (k >> 2) & 1));
  // the second cube at (1..2, 1..2, 0..1) shares cube A's corners (1,1,0) and (1,1,1): its vertices 0 and 4
  for (let k = 0; k < 8; k++) { const x = 1 + (k & 1), y = 1 + ((k >> 1) & 1), z = (k >> 2) & 1; b.push(x === 1 && y === 1 ? a[3 + (z ? 4 : 0)] : idx(x, y, z)); }
  return { positions: new Float32Array(pos), indices: [...cubeTris(a), ...cubeTris(b)] };
}

test("two blocks touching along an edge: closed, the shared edge counted as non-manifold, volume 2", () => {
  const m = twoCubesOnAnEdge();
  const c = isMeshClosed(m.positions, m.indices);
  assert.equal(c.closed, true);
  assert.equal(c.boundaryEdges, 0);
  assert.equal(c.nonManifoldEdges, 1);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3)); g.setIndex(m.indices);
  const v = computeMeshVolume(g);
  assert.equal(v.watertight, true);
  assert.equal(v.openEdgeCount, 0);
  assert.equal(v.nonManifoldEdgeCount, 1);
  assert.ok(Math.abs(v.volumeM3 - 2) < 1e-9, String(v.volumeM3));
});

test("a real hole is still open: a cube with one face missing (its edges used once or three times)", () => {
  const m = twoCubesOnAnEdge();
  const open = { positions: m.positions, indices: m.indices.slice(6) }; // drop cube A's first face (2 triangles)
  const c = isMeshClosed(open.positions, open.indices);
  assert.equal(c.closed, false);
  assert.ok(c.boundaryEdges >= 4);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(open.positions, 3)); g.setIndex(open.indices);
  assert.equal(computeMeshVolume(g).watertight, false);
});

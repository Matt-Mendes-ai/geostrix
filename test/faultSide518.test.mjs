// TASKS.csv #518 — fault-side classification against the nearest TRIANGLE, not the nearest vertex.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { classifyPointAgainstFault } from "../src/lib/viewer/modelHelpers.js";

// a vertical fault in the plane x = 0 (normal +x after computeVertexNormals), 200 x 200 m, in a 5 x 5 vertex grid,
// plus one ORPHAN vertex (no face uses it) — GemPy meshes carry these (useModelling #416: one 85 m off the Harry DACT)
function faultMesh(orphan) {
  const pos = [], idx = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) pos.push(0, -100 + i * 50, -100 + j * 50);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const a = j * 5 + i; idx.push(a, a + 1, a + 6, a, a + 6, a + 5); }
  if (orphan) pos.push(...orphan);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g);
}

test("#518 orientation of the synthetic fault: +x is side +1, -x side -1", () => {
  const m = faultMesh(null);
  const s = classifyPointAgainstFault({ x: 30, y: 10, z: 10 }, m);
  assert.equal(classifyPointAgainstFault({ x: -30, y: 10, z: 10 }, m), -s);
});

test("#518 an orphan vertex (zero normal) next to the point no longer decides its side", () => {
  const clean = faultMesh(null), dirty = faultMesh([-38, 10, 10]); // orphan 2 m from the test point, on the -x side
  const p = { x: -40, y: 10, z: 10 };
  assert.equal(classifyPointAgainstFault(p, dirty), classifyPointAgainstFault(p, clean));
});

test("#518 near a coarse corner the nearest triangle decides, not an averaged vertex normal", () => {
  // a fault bent 90° along z = 0: x = 0 for z < 0, then the plane z = 0 for x > 0 (an L in section)
  const pos = [0, -100, -200, 0, 100, -200, 0, -100, 0, 0, 100, 0, 200, -100, 0, 200, 100, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g);
  // a point just below the horizontal limb, near the bend: its side is that limb's side, i.e. the same as a point
  // straight below the limb far from the bend
  const far = classifyPointAgainstFault({ x: 150, y: 0, z: -5 }, m);
  assert.equal(classifyPointAgainstFault({ x: 12, y: 0, z: -5 }, m), far);
});

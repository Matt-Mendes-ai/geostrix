// TASKS.csv #2945 (review #2876 modelA-2) — the stall when a GemPy result lands: most of it was the BVH build of the fold-back check
// (lib/meshQuery.js buildMeshQuery), which rescanned every node's triangles for its box and sorted every slice for the median. Now boxes are
// unions of the children's, the axis comes from the centroids, the median from a quickselect. The answers must not change.
import test from "node:test";
import assert from "node:assert/strict";
import { buildMeshQuery, closestPointOnMesh, isPointInsideMesh } from "../src/lib/meshQuery.js";

// an irregular closed-ish shell: a jittered sphere (a closed mesh, for the inside test)
function sphere(n, r = 50) {
  const P = [], I = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i <= n; i++) for (let j = 0; j < 2 * n; j++) {
    const th = (Math.PI * i) / n, ph = (Math.PI * j) / n, rr = r * (1 + 0.05 * rnd());
    P.push(rr * Math.sin(th) * Math.cos(ph), rr * Math.cos(th), rr * Math.sin(th) * Math.sin(ph));
  }
  const id = (i, j) => i * 2 * n + (j % (2 * n));
  for (let i = 0; i < n; i++) for (let j = 0; j < 2 * n; j++) { I.push(id(i, j), id(i + 1, j), id(i, j + 1)); I.push(id(i, j + 1), id(i + 1, j), id(i + 1, j + 1)); }
  return { P: Float64Array.from(P), I: Uint32Array.from(I) };
}
// brute force: the closest point over every triangle (by sampling each triangle densely is too slow; use the library's own per-triangle
// routine through a one-triangle query)
function bruteDistance(P, I, p) {
  let best = Infinity;
  for (let t = 0; t < I.length; t += 3) {
    const q = buildMeshQuery(P, I.subarray(t, t + 3));
    const r = closestPointOnMesh(q, p);
    const d = r.distance ?? Math.sqrt(r.distSq);
    if (d < best) best = d;
  }
  return best;
}

test("every node's box holds its triangles; the tree covers each triangle once", () => {
  const { P, I } = sphere(24);
  const q = buildMeshQuery(P, I);
  const seen = new Uint8Array(q.triCount);
  const walk = (nd) => {
    for (let k = nd.from; k < nd.to; k++) {
      const t = q.triIndices[k];
      for (let c = 0; c < 3; c++) { const v = I[t * 3 + c] * 3; assert.ok(P[v] >= nd.minx - 1e-9 && P[v] <= nd.maxx + 1e-9 && P[v + 1] >= nd.miny - 1e-9 && P[v + 1] <= nd.maxy + 1e-9 && P[v + 2] >= nd.minz - 1e-9 && P[v + 2] <= nd.maxz + 1e-9); }
      if (!nd.left) seen[t]++;
    }
    if (nd.left) { assert.equal(nd.left.from, nd.from); assert.equal(nd.left.to, nd.right.from); assert.equal(nd.right.to, nd.to); walk(nd.left); walk(nd.right); }
  };
  walk(q.root);
  assert.ok(seen.every((v) => v === 1), "each triangle in exactly one leaf");
});

test("closest-point distances and inside answers match brute force", () => {
  const { P, I } = sphere(12);
  const q = buildMeshQuery(P, I);
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 160;
  for (let k = 0; k < 25; k++) {
    const p = { x: rnd(), y: rnd(), z: rnd() };
    const r = closestPointOnMesh(q, p), d = r.distance ?? Math.sqrt(r.distSq);
    assert.ok(Math.abs(d - bruteDistance(P, I, p)) < 1e-9, `point ${k}`);
  }
  assert.equal(isPointInsideMesh(q, { x: 0, y: 0, z: 0 }), true);
  assert.equal(isPointInsideMesh(q, { x: 0, y: 80, z: 0 }), false);
});

test("a large mesh builds quickly (the landing stall's main part)", () => {
  const n = 300, P = new Float32Array((n + 1) * (n + 1) * 3), I = new Uint32Array(n * n * 6);
  let k = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { P[k++] = i * 5; P[k++] = 400 + 10 * Math.sin(i / 7) * Math.cos(j / 9); P[k++] = -j * 5; }
  k = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; I[k++] = a; I[k++] = a + 1; I[k++] = a + n + 1; I[k++] = a + 1; I[k++] = a + n + 2; I[k++] = a + n + 1; }
  const t0 = performance.now();
  const q = buildMeshQuery(P, I);
  const ms = performance.now() - t0;
  assert.equal(q.triCount, 180000);
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms for 180,000 triangles (about 1.5 s before)`);
});

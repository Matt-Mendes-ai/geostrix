// TASKS.csv #794 — are grade / alteration shells watertight? The backlog row (from the #792 PyVista review) assumed the
// classic tables crack on ambiguous cells. Measured: Bourke's 256-case table resolves every ambiguous FACE the same way
// from both cubes that share it, so the indexed mesh has no cracks - even on pure noise, where nearly every cell is
// ambiguous. These tests pin that: every edge in exactly two triangles, once in each direction (consistent winding).
import test from "node:test";
import assert from "node:assert/strict";
import { marchingCubes } from "../src/lib/marchingCubes.js";
import { computeMeshVolume } from "../src/lib/volumetrics.js";

let seed = 794;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const field = (n, f) => { const v = new Float64Array(n * n * n); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[i + n * (j + n * k)] = f(i, j, k); return v; };
function edges(faces) {
  const und = new Map(), dir = new Set();
  let twice = 0;
  for (const [a, b, c] of faces) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const k = p < q ? `${p},${q}` : `${q},${p}`;
    und.set(k, (und.get(k) || 0) + 1);
    if (dir.has(`${p}>${q}`)) twice++; else dir.add(`${p}>${q}`);
  }
  let bad = 0;
  for (const n of und.values()) if (n !== 2) bad++;
  return { bad, twice };
}
// a minimal stand-in for a THREE.BufferGeometry, enough for computeMeshVolume
const geom = (mc) => {
  const p = mc.vertices.flat(), ix = mc.faces.flat();
  return { attributes: { position: { count: p.length / 3, getX: (i) => p[3 * i], getY: (i) => p[3 * i + 1], getZ: (i) => p[3 * i + 2] } }, index: { count: ix.length, getX: (i) => ix[i] } };
};

test("#794 closed shells are watertight and consistently wound even where every cell is ambiguous", () => {
  for (const [name, f] of [
    ["noise", () => rnd()],
    ["checkerboard + noise", (i, j, k) => ((i + j + k) % 2) + 0.2 * rnd()],
    ["two touching blobs", (i, j, k) => Math.max(1.2 - Math.hypot(i - 8, j - 10, k - 10) / 5, 1.2 - Math.hypot(i - 15, j - 10, k - 10) / 5)],
  ]) {
    const mc = marchingCubes(field(20, f), 20, 20, 20, 0.5, { noData: "outside" });
    assert.ok(mc.faces.length > 100, name);
    const e = edges(mc.faces);
    assert.equal(e.bad, 0, `${name}: edges not shared by exactly two triangles`);
    assert.equal(e.twice, 0, `${name}: inconsistent winding`);
    assert.equal(computeMeshVolume(geom(mc)).watertight, true, name);
  }
});

test("#794 the sphere's volume: watertight and close to 4/3 pi r^3", () => {
  const n = 40, r = 15;
  const mc = marchingCubes(field(n, (i, j, k) => r - Math.hypot(i - 19.5, j - 19.5, k - 19.5)), n, n, n, 0, {});
  const v = computeMeshVolume(geom(mc));
  assert.ok(v.watertight);
  const exact = (4 / 3) * Math.PI * r ** 3;
  assert.ok(Math.abs(v.volumeM3 - exact) / exact < 0.01, `${v.volumeM3} vs ${exact}`);
});

test("#794 \"skip\" mode: the only open edges are at the no-data boundary", () => {
  const n = 20, hole = (i) => i >= 14; // no estimate east of x = 14
  const mc = marchingCubes(field(n, (i, j, k) => (hole(i) ? NaN : 6 - Math.hypot(i - 12, j - 10, k - 10))), n, n, n, 0, {});
  const und = new Map();
  for (const [a, b, c] of mc.faces) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = p < q ? `${p},${q}` : `${q},${p}`; und.set(k, (und.get(k) || 0) + 1); }
  let open = 0;
  for (const [k, cnt] of und) {
    if (cnt === 2) continue;
    open++;
    for (const vi of k.split(",").map(Number)) assert.ok(mc.vertices[vi][0] >= 12.99, `open edge away from the no-data wall at x=${mc.vertices[vi][0]}`);
  }
  assert.ok(open > 0, "the shell is open where the estimate stops");
});

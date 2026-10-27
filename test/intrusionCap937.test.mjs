// TASKS.csv #937 — intrusion bodies with dipping walls must stay valid solids after the Float32 scene buffer (the path
// "Restrict to a modelled volume" reads them through): no sliver triangles in the base cap crossing the walls
import test from "node:test";
import assert from "node:assert/strict";
import { intrusionBody, earClip } from "../src/lib/intrusionBody.js";
import { validateSolid, isValidSolid } from "../src/lib/meshValidate.js";

const E0 = 500000, N0 = 6200000;
const flat = () => 1000;
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// a wiggly outcrop of 80 points (two sine wobbles on a circle of 100-300 m)
const blobOf = (r, n = 80) => {
  const a1 = r() * 40, a2 = r() * 20, k1 = 2 + Math.floor(r() * 5), k2 = 7 + Math.floor(r() * 8), p1 = r() * 6, p2 = r() * 6, R = 100 + r() * 200;
  const ring = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI, rr = R * (1 + (a1 / 100) * Math.sin(k1 * a + p1) + (a2 / 100) * Math.sin(k2 * a + p2)); ring.push([E0 + rr * Math.cos(a), N0 + rr * Math.sin(a)]); }
  return ring;
};
// world -> Float32 scene (x = E - ox, y = z - oz, z = -(N - oy)) -> world, as closedShellsForEstimation reads it
function viaScene(w) {
  const o = { x: E0 + 300, y: N0 + 200, z: 900 }, P = new Float64Array(w.length);
  for (let i = 0; i < w.length; i += 3) {
    const sx = Math.fround(w[i] - o.x), sy = Math.fround(w[i + 2] - o.z), sz = Math.fround(o.y - w[i + 1]);
    P[i] = sx + o.x; P[i + 1] = o.y - sz; P[i + 2] = sy + o.z;
  }
  return P;
}

test("#937 dipping-wall intrusion bodies stay valid solids through the Float32 scene buffer", () => {
  for (const [wallDip, flare, depthM] of [[60, "out", 300], [75, "in", 150]]) {
    const r = rng(7);
    let built = 0, bad = 0;
    for (let k = 0; k < 30; k++) {
      let b;
      try { b = intrusionBody(blobOf(r), flat, { depthM, wallDip, flare }); } catch { continue; }
      built++;
      if (!isValidSolid(validateSolid(viaScene(b.positions), b.indices))) bad++;
    }
    assert.ok(built >= 20, `${wallDip} ${flare}: ${built} built`);
    assert.equal(bad, 0, `${wallDip} ${flare}: ${bad}/${built} invalid`);
  }
});

test("#937 earClip of straight runs at UTM coordinates: n - 2 triangles, none of zero area, none spanning outline points", () => {
  const ring = [];
  const side = (a, b) => { for (let j = 0; j < 16; j++) ring.push([a[0] + ((b[0] - a[0]) * j) / 16, a[1] + ((b[1] - a[1]) * j) / 16]); };
  const A = [E0, N0], B = [E0 + 400, N0], C = [E0 + 400, N0 + 300], D = [E0, N0 + 300];
  side(A, B); side(B, C); side(C, D); side(D, A);
  const tris = earClip(ring);
  assert.equal(tris.length, ring.length - 2);
  const n = ring.length;
  for (const [a, b, c] of tris) {
    const ar = Math.abs((ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[b][1] - ring[a][1]) * (ring[c][0] - ring[a][0])) / 2;
    assert.ok(ar > 1, `zero-area triangle ${a},${b},${c}`);
    // an edge between two outline points that are not neighbours must not run along the outline
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      if ((u + 1) % n === v || (v + 1) % n === u) continue;
      const sameSide = Math.floor(u / 16) === Math.floor(v / 16) || (u % 16 === 0 && Math.floor(v / 16) === (Math.floor(u / 16) + 3) % 4);
      assert.ok(!sameSide, `edge ${u}-${v} runs along a side`);
    }
  }
});

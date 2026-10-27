// TASKS.csv #938 / #939 — intrusion bodies from the map: outcrops of one unit whose widening walls cross at depth become
// separate bodies (each a valid solid) instead of one self-crossing mesh; narrowing walls never leave the outcrop
import test from "node:test";
import assert from "node:assert/strict";
import { buildIntrusionBodies } from "../src/modules/viewer/intrusionRun.js";
import { intrusionBody } from "../src/lib/intrusionBody.js";
import { validateSolid, isValidSolid } from "../src/lib/meshValidate.js";

const E0 = 500000, N0 = 6200000;
const terrain = { bbox: [E0 - 2000, N0 - 2000, E0 + 2000, N0 + 2000], gridW: 2, gridH: 2, elevations: new Float32Array([1000, 1000, 1000, 1000]) };
const sq = (x0, y0, s) => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]];
const layer = (rings) => ({ name: "geology", features: rings.map((r) => ({ parts: [r], attributes: { UNIT: "Kqm" } })), categories: [] });
function run(rings, opts) {
  const surfaces = [], notices = [], meshes = {};
  const added = [];
  buildIntrusionBodies({ layer: layer(rings), field: "UNIT", units: ["Kqm"], depthM: 300, ...opts }, {
    implicitGroupRef: { current: { add: (m) => added.push(m) } }, implicitMeshesRef: { current: meshes }, originRef: { current: { x: E0, y: N0, z: 0 } },
    setImplicitSurfaces: (f) => surfaces.push(...f([])), setNotices: (f) => notices.push(...f([])), terrain,
  });
  return { surfaces, notices: notices.map((n) => n.text || String(n)).join(" "), meshes };
}
// the scene mesh back to world coordinates, as the inside tests and Restrict read it
const worldOf = (mesh) => { const s = mesh.geometry.attributes.position.array, w = new Float64Array(s.length); for (let i = 0; i < s.length; i += 3) { w[i] = s[i] + E0; w[i + 1] = N0 - s[i + 2]; w[i + 2] = s[i + 1]; } return { pos: w, idx: mesh.geometry.index.array }; };

test("#938 two outcrops 100 m apart with 60 deg outward walls: two numbered bodies, each a valid solid", () => {
  const { surfaces, notices, meshes } = run([sq(E0, N0, 200), sq(E0 + 300, N0, 200)], { wallDip: 60, flare: "out" });
  assert.deepEqual(surfaces.map((s) => s.name), ["Kqm intrusion body 1 (from the map)", "Kqm intrusion body 2 (from the map)"]);
  for (const s of surfaces) { const { pos, idx } = worldOf(meshes[s.id]); assert.ok(isValidSolid(validateSolid(pos, idx)), s.name); }
  assert.match(notices, /grow into each other at depth/);
});

test("#938 vertical walls (no crossing): one body for the unit, as before", () => {
  const { surfaces, notices } = run([sq(E0, N0, 200), sq(E0 + 300, N0, 200)], { wallDip: 90, flare: "out" });
  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].params.polygons, 2);
  assert.doesNotMatch(notices, /grow into each other/);
});

test("#939 inward walls: a crescent is refused rather than built outside its outcrop; achieved dips are returned", () => {
  const cres = [];
  for (let i = 0; i <= 40; i++) { const a = Math.PI * (i / 40); cres.push([E0 + 200 * Math.cos(a), N0 + 200 * Math.sin(a)]); }
  for (let i = 40; i >= 0; i--) { const a = Math.PI * (i / 40); cres.push([E0 + 120 * Math.cos(a), N0 + 120 * Math.sin(a)]); }
  const inside = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  // the review's crescent (outer 200 m, inner 120 m, a full arc of the outer circle minus the inner) and this half ring,
  // at 60-80 deg inward: refused, or built with every base vertex under the outcrop (the old fallback put 352/352 outside)
  const rev = [];
  for (let i = 0; i < 60; i++) { const a = (2 * Math.PI * i) / 60; rev.push([E0 + 200 * Math.cos(a), N0 + 200 * Math.sin(a)]); }
  for (let i = 59; i >= 0; i--) { const a = (2 * Math.PI * i) / 60; const x = E0 + 70 + 120 * Math.cos(a), y = N0 + 120 * Math.sin(a); if (Math.hypot(x - E0, y - N0) < 199) rev.push([x, y]); }
  let refused = 0;
  for (const ring of [cres, rev]) for (const dip of [60, 75, 80]) {
    let b;
    try { b = intrusionBody(ring, () => 1000, { depthM: 150, wallDip: dip, flare: "in" }); } catch (e) { assert.match(e.message, /inward cross over/); refused++; continue; }
    const P = b.positions;
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 2] - b.baseZ) < 1e-6) assert.ok(inside(P[i], P[i + 1], ring), `${dip}: base point outside the outcrop`);
  }
  assert.ok(refused > 0);
  const b = intrusionBody(sq(E0, N0, 400), () => 1000, { depthM: 150, wallDip: 75, flare: "in" });
  assert.ok(b.wallDipDeg[0] > 65 && b.wallDipDeg[1] <= 75.01, String(b.wallDipDeg));
});

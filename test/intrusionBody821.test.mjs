// TASKS.csv #821 — an intrusion from the map as a closed body: watertight, outward-facing, the volume of the solid it
// describes, and refused where it cannot be built
import test from "node:test";
import assert from "node:assert/strict";
import { intrusionBody, selfIntersects } from "../src/lib/intrusionBody.js";
import { meshVolume } from "../src/lib/unitVolumes.js";
import { isMeshClosed } from "../src/lib/meshQuery.js";

const E0 = 500000, N0 = 6000000; // UTM-sized coordinates, as real maps have
const square = (s) => [[E0, N0], [E0 + s, N0], [E0 + s, N0 + s], [E0, N0 + s], [E0, N0]];
const flat = () => 100;
const near = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.abs(b);

test("#821 vertical walls on flat ground: a closed prism of area x depth", () => {
  const b = intrusionBody(square(1000), flat, { depthM: 500 });
  assert.equal(isMeshClosed(b.positions, b.indices).closed, true);
  const v = meshVolume(b.positions, b.indices);
  assert.ok(near(v, 1000 * 1000 * 500), `${v}`); // positive: wound outward
  assert.equal(b.baseZ, -400);
  assert.deepEqual(b.wallOffsetM.map(Math.round), [0, 0]);
});

test("#821 walls dipping 45° out / in: the frustum's volume", () => {
  const out = intrusionBody(square(1000), flat, { depthM: 500, wallDip: 45, flare: "out" });
  assert.equal(isMeshClosed(out.positions, out.indices).closed, true);
  const A1 = 1e6, A2 = 2000 * 2000;
  assert.ok(near(meshVolume(out.positions, out.indices), (500 / 3) * (A1 + A2 + Math.sqrt(A1 * A2))));
  const inn = intrusionBody(square(1000), flat, { depthM: 400, wallDip: 45, flare: "in" });
  const B2 = 200 * 200;
  assert.ok(near(meshVolume(inn.positions, inn.indices), (400 / 3) * (A1 + B2 + Math.sqrt(A1 * B2))));
  // narrowing walls that would close before 600 m: built to where they close, said so (2 x area / perimeter = 500 m;
  // the base is a fifth of the outline -> 400 m down)
  const pin = intrusionBody(square(1000), flat, { depthM: 600, wallDip: 45, flare: "in" });
  assert.equal(isMeshClosed(pin.positions, pin.indices).closed, true);
  assert.ok(Math.abs(pin.pinchedAtM - 400) < 1e-6 && Math.abs(pin.baseZ - -300) < 1e-6);
  assert.ok(near(meshVolume(pin.positions, pin.indices), (400 / 3) * (A1 + B2 + Math.sqrt(A1 * B2))));
  assert.equal(inn.pinchedAtM, null);
});

test("#821 the top follows the ground; a concave, clockwise outline still closes", () => {
  const slope = (x) => 100 + 0.1 * (x - E0);
  const b = intrusionBody(square(1000), (x) => slope(x), { depthM: 500 });
  assert.ok(near(meshVolume(b.positions, b.indices), 1e6 * 550)); // base at 100 - 500; mean height 500 + 50
  for (let i = 0; i < b.positions.length; i += 3) if (b.positions[i + 2] > b.baseZ) assert.ok(Math.abs(b.positions[i + 2] - slope(b.positions[i])) < 1e-6);
  // an L, given clockwise
  const L = [[0, 0], [0, 600], [300, 600], [300, 300], [900, 300], [900, 0], [0, 0]].map(([x, y]) => [E0 + x, N0 + y]);
  const l = intrusionBody(L, flat, { depthM: 200, wallDip: 70, flare: "out" });
  assert.equal(isMeshClosed(l.positions, l.indices).closed, true);
  assert.ok(meshVolume(l.positions, l.indices) > (300 * 600 + 600 * 300) * 200);
  assert.ok(near(l.planAreaM2, 300 * 600 + 600 * 300));
});

test("#821 refused off the terrain; the self-crossing check", () => {
  assert.throws(() => intrusionBody(square(1000), (x) => (x > E0 + 500 ? NaN : 100)), /beyond the terrain/);
  assert.equal(selfIntersects([[0, 0], [10, 0], [0, 10], [10, 10]]), true);
  assert.equal(selfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]]), false);
});

test("#821 appendNotice keeps a notice an object (notice(...) + text printed [object Object])", async () => {
  const { notice, appendNotice } = await import("../src/lib/notices.js");
  const n = appendNotice(notice("Model from the map: {v} surface(s)", { v: 2 }), " More.");
  assert.equal(typeof n, "object");
  assert.equal(n.text, "Model from the map: 2 surface(s) More.");
  assert.equal(appendNotice(n, ""), n);
});

test("#821 a wiggly mapped outline with dipping walls: the base is offset from the simplified outline, the top keeps every wiggle", () => {
  // a 300 m disc whose outline wiggles +-8 m every ~10 m, as digitized maps do; walls 70° outward to 500 m
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const ring = Array.from({ length: 190 }, (_, i) => { const a = (2 * Math.PI * i) / 190, rr = 300 + 8 * rnd(); return [E0 + rr * Math.cos(a), N0 + rr * Math.sin(a)]; });
  const b = intrusionBody(ring, flat, { depthM: 500, wallDip: 70, flare: "out", stepM: 10 });
  assert.equal(isMeshClosed(b.positions, b.indices).closed, true);
  assert.ok(b.baseCorners < b.corners / 3, `${b.baseCorners} of ${b.corners} corners kept for the base`);
  const r1 = 300, r2 = 300 + 500 / Math.tan((70 * Math.PI) / 180);
  const v = meshVolume(b.positions, b.indices), want = (Math.PI * 500 / 3) * (r1 * r1 + r1 * r2 + r2 * r2);
  assert.ok(Math.abs(v - want) / want < 0.04, `volume ${(v / 1e6).toFixed(1)} vs ${(want / 1e6).toFixed(1)} Mm³`);
  // the top still passes through every mapped vertex
  for (const [x, y] of ring) {
    let best = Infinity;
    for (let i = 0; i < b.positions.length; i += 3) if (b.positions[i + 2] === 100) best = Math.min(best, Math.hypot(b.positions[i] - x, b.positions[i + 1] - y));
    assert.ok(best < 1e-6);
  }
});

test("#821 review: an intrusion body is a solid (offered in Restrict to a modelled volume, proposed as a solid)", async () => {
  const { SOLID_SURFACE_TYPES } = await import("../src/lib/viewer/modelHelpers.js");
  assert.ok(SOLID_SURFACE_TYPES.has("intrusion_body"));
});

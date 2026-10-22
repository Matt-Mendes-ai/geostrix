// TASKS.csv #803 — a grade shell that reaches the surface must close ON the ground: nothing above it, still watertight,
// and the volume of the part below the ground.
import test from "node:test";
import assert from "node:assert/strict";
import { capFieldAtGround } from "../src/lib/groundCap.js";
import { marchingCubes } from "../src/lib/marchingCubes.js";

const n = 41, h = 2; // nodes from -40 to 40 m every 2 m
const origin = { x: -40, y: -40, z: -40 };
const field = (f) => { const v = new Float64Array(n * n * n); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[i + n * (j + n * k)] = f(origin.x + i * h, origin.y + j * h, origin.z + k * h); return v; };
const volumeAndEdges = (mc) => {
  let v6 = 0; const E = new Map();
  for (const [a, b, c] of mc.faces) {
    const [p, q, r] = [mc.vertices[a], mc.vertices[b], mc.vertices[c]];
    v6 += p[0] * (q[1] * r[2] - q[2] * r[1]) + p[1] * (q[2] * r[0] - q[0] * r[2]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
    for (const [s, t] of [[a, b], [b, c], [c, a]]) { const k = s < t ? `${s},${t}` : `${t},${s}`; E.set(k, (E.get(k) || 0) + 1); }
  }
  return { volume: Math.abs(v6) / 6, open: [...E.values()].filter((x) => x !== 2).length };
};

test("#803 a grade sphere cut by flat ground: closes on the ground, watertight, the volume of the buried part", () => {
  const R = 20, iso = 1;
  const v = field((x, y, z) => 1 + (R - Math.hypot(x, y, z)) / 10); // = iso on a 20 m sphere at the origin
  const flat = () => 8; // ground 8 m above the sphere's centre
  const { values, capped } = capFieldAtGround(v, n, n, n, origin, { x: h, y: h, z: h }, iso, flat);
  assert.ok(capped > 0);
  const mc = marchingCubes(values, n, n, n, iso, { origin, spacing: { x: h, y: h, z: h } });
  const zmax = Math.max(...mc.vertices.map((p) => p[2]));
  assert.ok(zmax <= 8 + 1e-6, `top of the shell at ${zmax}`);
  assert.ok(zmax > 8 - 0.5, "it reaches the ground");
  const { volume, open } = volumeAndEdges(mc);
  assert.equal(open, 0, "still a closed solid");
  // sphere minus the cap above z = 8: V = 4/3 pi R^3 - pi c^2 (3R - c) / 3, c = R - 8
  const c = R - 8, exact = (4 / 3) * Math.PI * R ** 3 - (Math.PI * c * c * (3 * R - c)) / 3;
  assert.ok(Math.abs(volume - exact) / exact < 0.02, `${volume} vs ${exact}`);
});

test("#803 deep shells are untouched; sloping ground; outside the terrain nothing changes", () => {
  const iso = 1, v = field((x, y, z) => 1 + (8 - Math.hypot(x, y, z + 25)) / 10); // 8 m sphere centred 25 m down
  const r = capFieldAtGround(v, n, n, n, origin, { x: h, y: h, z: h }, iso, () => 10);
  const before = marchingCubes(v, n, n, n, iso, { origin, spacing: { x: h, y: h, z: h } });
  const after = marchingCubes(r.values, n, n, n, iso, { origin, spacing: { x: h, y: h, z: h } });
  assert.equal(after.faces.length, before.faces.length, "a shell well below the ground is the same shell");
  // sloping ground z = x / 2: every shell vertex at or below it
  const w = field((x, y, z) => 1 + (20 - Math.hypot(x, y, z)) / 10);
  const s = capFieldAtGround(w, n, n, n, origin, { x: h, y: h, z: h }, iso, (x) => x / 2);
  const m = marchingCubes(s.values, n, n, n, iso, { origin, spacing: { x: h, y: h, z: h } });
  for (const p of m.vertices) assert.ok(p[2] <= p[0] / 2 + 0.3, `vertex ${p} above the slope`);
  assert.equal(volumeAndEdges(m).open, 0);
  assert.equal(capFieldAtGround(w, n, n, n, origin, { x: h, y: h, z: h }, iso, () => NaN).capped, 0);
});

test("#803 a warped grid: the ground is looked up at each node's real position", () => {
  const iso = 1, v = field((x, y, z) => 1 + (20 - Math.hypot(x, y, z)) / 10);
  // a grid stored at half height (real z = 2 x grid z): ground at real z = 8 is grid z = 4
  const r = capFieldAtGround(v, n, n, n, origin, { x: h, y: h, z: h }, iso, () => 8, { toReal: (p) => ({ x: p.x, y: p.y, z: 2 * p.z }) });
  const m = marchingCubes(r.values, n, n, n, iso, { origin, spacing: { x: h, y: h, z: h } });
  assert.ok(Math.max(...m.vertices.map((p) => p[2])) <= 4 + 1e-6);
});

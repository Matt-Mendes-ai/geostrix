// TASKS.csv #588 — known-answer tests for pure logic whose numbers geologists report: the IGRF inducing field
// (every magnetic inversion), mesh volume / tonnage, true width, and the variogram model / fit. A refactor that
// moves or rewrites these must not change the answers silently.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { igrfField, decimalYear } from "../src/lib/igrf.js";
import { computeMeshVolume, computeTonnage } from "../src/lib/volumetrics.js";
import { marchingCubes } from "../src/lib/marchingCubes.js";
import { trueWidthFactor, trueWidthForIntercept } from "../src/lib/trueWidth.js";
import { variogramModelValue, fitVariogramModel } from "../src/lib/variogram.js";

// ---------- IGRF-14 ----------
// Reference values: the British Geological Survey's IGRF-14 web service (geomag.bgs.ac.uk, GMModels/igrf/14),
// queried 2026-10-11. Tolerance 5 nT / 0.05 deg, as the #494 review proposed.
const BGS = [
  { where: "Stewart BC area, 2025-01-01, 0 km", lat: 56, lon: -130, alt: 0, date: "2025-01-01", D: 17.746, I: 73.447, H: 15717, X: 14969, Y: 4791, Z: 52880, F: 55166 },
  { where: "Sao Paulo, 2012-07-01 (between epochs), 0 km", lat: -23.5, lon: -46.6, alt: 0, date: "2012-07-01", D: -20.699, I: -35.998, H: 18579, X: 17380, Y: -6567, Z: -13498, F: 22965 },
  { where: "Western Australia, 2027-06-15 (secular variation), 1 km", lat: -25, lon: 120, alt: 1, date: "2027-06-15", D: 1.106, I: -57.595, H: 29229, X: 29223, Y: 564, Z: -46048, F: 54541 },
];
for (const r of BGS) {
  test(`#588 IGRF-14 matches BGS at ${r.where}`, () => {
    const f = igrfField(r.lon, r.lat, r.alt, decimalYear(r.date));
    for (const [k, v] of [["north", r.X], ["east", r.Y], ["down", r.Z], ["horizontal", r.H], ["total", r.F]]) assert.ok(Math.abs(f[k] - v) <= 5, `${k} ${f[k]} vs ${v}`);
    assert.ok(Math.abs(f.declination - r.D) <= 0.05, `D ${f.declination} vs ${r.D}`);
    assert.ok(Math.abs(f.inclination - r.I) <= 0.05, `I ${f.inclination} vs ${r.I}`);
  });
}

// ---------- volume / tonnage ----------
const geom = (verts, faces) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts.flat()), 3));
  g.setIndex(faces.flat());
  return g;
};
test("#588 unit cube: volume 1, watertight; tonnage = volume x density", () => {
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const r = computeMeshVolume(geom(v, f));
  assert.ok(Math.abs(r.volumeM3 - 1) < 1e-9);
  assert.equal(r.watertight, true);
  assert.equal(r.openEdgeCount, 0);
  assert.equal(computeTonnage(1000, 2.7), 2700);
  assert.equal(computeTonnage(1000, 0), null);
});
test("#588 marching-cubes sphere: closed, volume within 2% of 4/3 pi r^3", () => {
  const n = 41, R = 15, c = 20, vals = new Float64Array(n * n * n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[i + n * (j + n * k)] = R - Math.hypot(i - c, j - c, k - c);
  const { vertices, faces } = marchingCubes(vals, n, n, n, 0);
  const r = computeMeshVolume(geom(vertices, faces));
  const exact = (4 / 3) * Math.PI * R ** 3;
  assert.equal(r.watertight, true);
  assert.ok(Math.abs(r.volumeM3 - exact) / exact < 0.02, `${r.volumeM3} vs ${exact}`);
});

// ---------- true width ----------
const DOWN = { x: 0, y: 0, z: -1 };
test("#588 true-width factor: 1 / 0 / 0.7071 for a vertical hole through flat / vertical / 45 deg planes", () => {
  assert.ok(Math.abs(trueWidthFactor(DOWN, 0, 0) - 1) < 1e-12);
  assert.ok(Math.abs(trueWidthFactor(DOWN, 90, 90)) < 1e-12);
  assert.ok(Math.abs(trueWidthFactor(DOWN, 45, 45) - Math.SQRT1_2) < 1e-12);
});
test("#588 true width on a curved trace uses the chord across the intercept", () => {
  // vertical for 10 m, then turning horizontal toward east: 10 m down, then 10 m east
  const trace = [{ md: 0, x: 0, y: 0, z: 0 }, { md: 10, x: 0, y: 0, z: -10 }, { md: 20, x: 10, y: 0, z: -10 }];
  // 5-15 m: from (0,0,-5) to (5,0,-10), chord at 45 deg; through a flat plane the factor is cos 45
  const r = trueWidthForIntercept(trace, 5, 15, 0, 0);
  assert.ok(Math.abs(r.factor - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(r.trueWidth - 10 * Math.SQRT1_2) < 1e-9);
  // the vertical leg alone gives the full width
  assert.ok(Math.abs(trueWidthForIntercept(trace, 1, 9, 0, 0).factor - 1) < 1e-9);
});

// ---------- variogram ----------
test("#588 variogram models: 0 at h=0, sill at the range (spherical), nugget just above 0", () => {
  const p = { model: "spherical", nugget: 0.2, sill: 1, range: 50 };
  assert.equal(variogramModelValue(0, p), 0);
  assert.ok(Math.abs(variogramModelValue(50, p) - 1) < 1e-12);
  assert.ok(Math.abs(variogramModelValue(80, p) - 1) < 1e-12);
  assert.ok(Math.abs(variogramModelValue(1e-6, p) - 0.2) < 1e-6);
  // exponential: practical range = 95% of the partial sill
  assert.ok(Math.abs(variogramModelValue(50, { ...p, model: "exponential" }) - (0.2 + 0.8 * (1 - Math.exp(-3)))) < 1e-12);
});
test("#588 the fit recovers known spherical parameters from noise-free bins", () => {
  const truth = { model: "spherical", nugget: 0.2, sill: 1, range: 50 };
  const bins = Array.from({ length: 20 }, (_, i) => { const h = 5 * (i + 1); return { h, gamma: variogramModelValue(h, truth), nPairs: 100 }; });
  const f = fitVariogramModel(bins, { model: "spherical" });
  assert.ok(Math.abs(f.nugget - 0.2) < 0.02, `nugget ${f.nugget}`);
  assert.ok(Math.abs(f.sill - 1) < 0.02, `sill ${f.sill}`);
  assert.ok(Math.abs(f.range - 50) / 50 < 0.02, `range ${f.range}`);
  assert.ok(f.rSquared > 0.999);
});

// ---------- vein plane ----------
import { fitPlane } from "../src/lib/vein.js";
test("#588 vein plane fit recovers a known dip / dip direction (30 toward 120)", () => {
  // plane through the origin dipping 30 deg toward 120: elevation falls along the dip direction
  const dd = (120 * Math.PI) / 180, tanDip = Math.tan((30 * Math.PI) / 180);
  const pts = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const x = 10 * i, y = 10 * j;
    pts.push({ x, y, z: -tanDip * (x * Math.sin(dd) + y * Math.cos(dd)) });
  }
  const f = fitPlane(pts);
  assert.ok(Math.abs(f.dip - 30) < 1e-6, `dip ${f.dip}`);
  assert.ok(Math.abs(f.dipDir - 120) < 1e-6, `dipDir ${f.dipDir}`);
  assert.ok(f.rmsOffPlane < 1e-9);
});

// TASKS.csv #650 — structural trends (dip / dip azimuth / pitch + ratios)
import { test } from "node:test";
import assert from "node:assert/strict";
import { trendBasis, trendScales, trendSearchScales, fromLegacyAnisotropy, planeFromPoles, poleOf, planeFromPoints, cleanTrend } from "../src/lib/trend.js";
import { searchEllipsoidBasis, anisoScales } from "../src/lib/viewer/geomath.js";

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const vclose = (u, v, tol = 1e-9) => close(u.x, v.x, tol) && close(u.y, v.y, tol) && close(u.z, v.z, tol);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test("the old two-angle anisotropy is exactly pitch 90 (same axes, same scales)", () => {
  for (const [az, dip] of [[45, 60], [0, 0], [315, 85], [170, 30]]) {
    const old = searchEllipsoidBasis(az, dip), t = fromLegacyAnisotropy({ azimuth: az, dip, major: 300, semiMajor: 150, minor: 50 });
    const nb = trendBasis(t);
    assert.ok(vclose(nb.major, old.major) && vclose(nb.semiMajor, old.semiMajor) && vclose(nb.minor, old.minor), `${az}/${dip}`);
    assert.deepEqual(trendScales(t), anisoScales({ major: 300, semiMajor: 150, minor: 50 }));
  }
});

test("axes are orthonormal; pitch 0 runs along strike, 90 down dip; the minor axis is the plane normal", () => {
  const b0 = trendBasis({ dip: 40, dipAzimuth: 120, pitch: 0 });
  for (const [u, v] of [[b0.major, b0.semiMajor], [b0.major, b0.minor], [b0.semiMajor, b0.minor]]) assert.ok(close(dot(u, v), 0));
  for (const u of [b0.major, b0.semiMajor, b0.minor]) assert.ok(close(Math.hypot(u.x, u.y, u.z), 1));
  assert.ok(close(b0.major.z, 0)); // strike is horizontal: azimuth 30 (dip azimuth - 90)
  assert.ok(close(Math.atan2(b0.major.x, b0.major.y) * 180 / Math.PI, 30));
  const b90 = trendBasis({ dip: 40, dipAzimuth: 120, pitch: 90 });
  assert.ok(close(Math.asin(-b90.major.z) * 180 / Math.PI, 40)); // plunges the full dip
  const pole = poleOf(40, 120);
  assert.ok(close(Math.abs(dot(b0.minor, pole)), 1));
  const b45 = trendBasis({ dip: 40, dipAzimuth: 120, pitch: 45 });
  assert.ok(Math.asin(-b45.major.z) > 0 && Math.asin(-b45.major.z) < 40 * Math.PI / 180); // oblique: plunges less than the dip
});

test("search scales keep the major axis at the search radius", () => {
  assert.deepEqual(trendSearchScales({ ratios: { max: 4, int: 2, min: 1 } }), { major: 1, semiMajor: 2, minor: 4 });
  assert.deepEqual(cleanTrend({ ratios: { max: 1, int: 5, min: 2 } }).ratios, { max: 5, int: 2, min: 1 }); // sorted
});

test("set from plane: mean of poles, and a best-fit plane through points", () => {
  const p = planeFromPoles([poleOf(50, 200), poleOf(54, 205), { ...poleOf(52, 202), z: -poleOf(52, 202).z, x: -poleOf(52, 202).x, y: -poleOf(52, 202).y }]);
  assert.ok(Math.abs(p.dip - 52) < 1 && Math.abs(p.dipAzimuth - 202) < 1, JSON.stringify(p));
  const n = poleOf(35, 310), pts = [];
  // points on the plane through the origin with that normal, plus a little noise
  for (let i = 0; i < 50; i++) { const u = (i % 7) * 13 - 40, v = Math.floor(i / 7) * 11 - 30; const a = { x: 1, y: 0, z: 0 }; const e1 = { x: a.y * n.z - a.z * n.y, y: a.z * n.x - a.x * n.z, z: a.x * n.y - a.y * n.x }; const e2 = { x: n.y * e1.z - n.z * e1.y, y: n.z * e1.x - n.x * e1.z, z: n.x * e1.y - n.y * e1.x }; pts.push({ x: u * e1.x + v * e2.x + 0.01 * (i % 3), y: u * e1.y + v * e2.y, z: u * e1.z + v * e2.z }); }
  const q = planeFromPoints(pts);
  assert.ok(Math.abs(q.dip - 35) < 0.5 && Math.abs(q.dipAzimuth - 310) < 0.5, JSON.stringify(q));
});

test("block estimation: a trend turns the search into an ellipsoid (major = the search radius)", async () => {
  const { estimateBlockModel } = await import("../src/lib/estimation.js");
  // a vertical E-W plane (dip 90 towards north) with pitch 0: the major axis runs east-west
  const t = { dip: 90, dipAzimuth: 0, pitch: 0, ratios: { max: 3, int: 1, min: 1 } };
  const { trendSearchScales } = await import("../src/lib/trend.js");
  const trend = { basis: trendBasis(t), scales: trendSearchScales(t) };
  const pts = [
    ...[0, 1, 2].map((i) => ({ x: 250, y: 0, z: i, value: 10, hole_id: "EAST" })),   // 250 m along the trend
    ...[0, 1, 2].map((i) => ({ x: 0, y: 250, z: i, value: 99, hole_id: "NORTH" })),  // 250 m across it
  ];
  const bounds = { xmin: -5, xmax: 5, ymin: -5, ymax: 5, zmin: -4, zmax: 6 };
  const run = (opts) => estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "idw2", searchRadius: 300, lengthWeight: false, ...opts }).cells[0];
  const iso = run({});
  assert.ok(iso.value > 10 && iso.value < 99, String(iso.value)); // both reachable without a trend
  const along = run({ trend });
  assert.ok(Math.abs(along.value - 10) < 1e-9, String(along.value)); // only the samples along the trend are within 300 x 1 m ...
  assert.equal(along.nHoles, 1);  // ... the ones across it would need 300 x 1/3 = 100 m
  assert.equal(run({ trend, searchRadius: 200 }), undefined); // beyond the major radius: nothing
});

test("geoML terms: a down-dip trend is azimuth = dip azimuth, dip = dip, rake 0; fractions from the ratios", async () => {
  const { trendToGeoml } = await import("../src/lib/trend.js");
  const g = trendToGeoml({ dip: 60, dipAzimuth: 135, pitch: 90, ratios: { max: 4, int: 2, min: 1 } });
  assert.ok(close(g.azimuth, 135, 1e-9) && close(g.dip, 60, 1e-9) && close(g.rake, 0, 1e-9), JSON.stringify(g));
  assert.equal(g.midFct, 0.5); assert.equal(g.minFct, 0.5);
  const s = trendToGeoml({ dip: 60, dipAzimuth: 135, pitch: 0 }); // along strike: horizontal major axis
  assert.ok(close(s.dip, 0, 1e-9) && (close(s.azimuth, 45, 1e-9) || close(s.azimuth, 225, 1e-9)), JSON.stringify(s));
  assert.ok(Math.abs(s.rake) <= 90);
});

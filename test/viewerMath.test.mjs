// TASKS.csv #445 step 1 — the pure maths moved out of ViewerModule.jsx (src/lib/viewer/*), tested on its own
// for the first time. Each case states the geometric fact it checks.
import test from "node:test";
import assert from "node:assert/strict";
import {
  searchEllipsoidBasis, searchEllipsoidDistSq, filterBySearchSupport, anisoScales, anisoWarpPoint, invScales, anisoWarpDirection,
  medianCollarSpacing, autoHaloParams, splitIntervalForSampling, spatialClusters, voxelCellSupported, sampleTerrainElevation,
} from "../src/lib/viewer/geomath.js";
import { depthKey, intervalEndIndex, continuesUnitAbove, mergeTouchingIntervals } from "../src/lib/viewer/intervals.js";

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test("#445 search ellipsoid: orthonormal basis along the trend; distance 1 at each range", () => {
  const b = searchEllipsoidBasis(30, 20);
  for (const [u, v] of [[b.major, b.semiMajor], [b.major, b.minor], [b.semiMajor, b.minor]]) assert.ok(near(dot(u, v), 0));
  for (const u of [b.major, b.semiMajor, b.minor]) assert.ok(near(dot(u, u), 1));
  assert.ok(b.major.z < 0 && b.major.x > 0 && b.major.y > 0); // plunges 20 deg toward azimuth 30
  const ranges = { major: 200, semiMajor: 100, minor: 20 };
  const o = { x: 0, y: 0, z: 0 };
  const along = (axis, r) => ({ x: axis.x * r, y: axis.y * r, z: axis.z * r });
  assert.ok(near(searchEllipsoidDistSq(o, along(b.major, 200), b, ranges), 1));
  assert.ok(near(searchEllipsoidDistSq(o, along(b.minor, 20), b, ranges), 1));
  assert.ok(searchEllipsoidDistSq(o, along(b.minor, 40), b, ranges) > 1);
  // a point with no neighbour inside the ellipsoid is dropped; two close points keep each other
  const pts = [{ x: 0, y: 0, z: 0 }, along(b.major, 50), { x: 5000, y: 0, z: 0 }];
  const kept = filterBySearchSupport(pts, { enabled: true, azimuth: 30, dip: 20, ...ranges, minSamples: 1 });
  assert.equal(kept.length, 2);
  assert.equal(filterBySearchSupport(pts, { enabled: false }).length, 3);
});

test("#445 anisotropy warp: volume-preserving scales, warp then inverse returns the point; isotropic = identity", () => {
  const s = anisoScales({ major: 400, semiMajor: 200, minor: 50 });
  assert.ok(near(s.major * s.semiMajor * s.minor, 1));
  const b = searchEllipsoidBasis(120, 35), c = { x: 10, y: 20, z: 30 }, p = { x: 110, y: -40, z: 75, tag: "keep" };
  const w = anisoWarpPoint(p, c, b, s), back = anisoWarpPoint(w, c, b, invScales(s));
  assert.ok(near(back.x, p.x, 1e-9) && near(back.y, p.y, 1e-9) && near(back.z, p.z, 1e-9));
  assert.equal(w.tag, "keep");
  const d = anisoWarpDirection(40, 75, b, { major: 1, semiMajor: 1, minor: 1 });
  assert.ok(near(d.dip, 40, 1e-9) && near(d.azimuth, 75, 1e-9));
});

test("#445 spacing, halo, interval splitting, clusters, support, terrain sampling", () => {
  assert.equal(medianCollarSpacing([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 250, y: 0 }]), 100); // nn = 100, 100, 150
  assert.equal(medianCollarSpacing([{ x: 0, y: 0 }]), null);
  assert.deepEqual(autoHaloParams([{ x: 0, y: 0 }, { x: 100, y: 0 }]), { radius: 120, cell: 15, spacing: 100 });
  const parts = splitIntervalForSampling(10, 20, 3);
  assert.equal(parts.length, 4);
  assert.ok(near(parts[3].to, 20) && near(parts[0].from, 10));
  assert.deepEqual(splitIntervalForSampling(5, 5, 1), []);
  const cl = spatialClusters([{ x: 0, y: 0, z: 0, srcCode: "A" }, { x: 5, y: 0, z: 0, srcCode: "B" }, { x: 100, y: 0, z: 0 }], 10);
  assert.deepEqual(cl.map((c) => [c.size, c.codes]), [[2, ["A", "B"]], [1, []]]);
  assert.equal(voxelCellSupported({ supportCutoff: 0.1 }, { support: 0.05 }), false);
  assert.equal(voxelCellSupported({ supportCutoff: 0.1 }, { support: 0.2 }), true);
  // 2x2 terrain, row 0 = north: north edge 100/200, south edge 300/400
  const t = { bbox: [0, 0, 10, 10], gridW: 2, gridH: 2, elevations: [100, 200, 300, 400] };
  assert.equal(sampleTerrainElevation(t, 0, 10), 100);
  assert.equal(sampleTerrainElevation(t, 10, 0), 400);
  assert.equal(sampleTerrainElevation(t, 5, 5), 250);
  assert.equal(sampleTerrainElevation(t, -50, 10), 100); // clamped to the edge
});

test("#445 intervals: split logging is one contact; touching intervals merge", () => {
  const rows = [{ hole_id: "A", from: 0, to: 11.2, value: "DACT" }, { hole_id: "A", from: 11.2, to: 25, value: "DACT" }, { hole_id: "A", from: 25, to: 60, value: "VCL" }];
  const ends = intervalEndIndex(rows);
  assert.equal(depthKey("A", 11.2), "A|11.200");
  assert.equal(continuesUnitAbove(ends, rows[1], new Set(["DACT"])), true);  // a split, not a top
  assert.equal(continuesUnitAbove(ends, rows[2], new Set(["VCL"])), false);  // a real top of VCL
  const merged = mergeTouchingIntervals(rows.slice(0, 2));
  assert.deepEqual(merged.map((r) => [r.from, r.to, r.merged]), [[0, 25, 2]]);
});

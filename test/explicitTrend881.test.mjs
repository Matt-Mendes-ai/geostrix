// TASKS.csv #881 — a structural trend as anisotropy in an explicit surface's fit
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface, surfaceFrame, trendInPlane } from "../src/lib/explicitSurface.js";
import { provenanceLines } from "../src/lib/meshExport.js";

// a contact that varies only ACROSS a north-south trend (a trough along y), sampled on three east-west lines
const z = (x) => 100 - 0.002 * (x - 500) ** 2;
const pts = [];
for (const y of [0, 500, 1000]) for (let x = 0; x <= 1000; x += 100) pts.push({ x, y, z: z(x) + (y === 500 && x === 500 ? 30 : 0) }); // a 30 m bump at (500, 500)
const trendNS = { dip: 0, dipAzimuth: 90, pitch: 90, ratios: { max: 4, int: 1, min: 1 } };

test("#881 trendInPlane: the major axis of a horizontal north trend projected into a map frame", () => {
  // dip 0, dip azimuth 90 -> strike = 0 deg (north); pitch 0 -> major along strike = north
  const an = trendInPlane({ dip: 0, dipAzimuth: 90, pitch: 0, ratios: { max: 4, int: 1, min: 1 } }, surfaceFrame(pts, { frame: "map" }));
  assert.ok(an && Math.abs(an.ratio - 4) < 1e-9);
  assert.ok(an.azimuthDeg < 1 || an.azimuthDeg > 179, `azimuth ${an.azimuthDeg}`);
  assert.equal(trendInPlane(null, surfaceFrame(pts)), null);
  assert.equal(trendInPlane({ ...trendNS, ratios: { max: 1, int: 1, min: 1 } }, surfaceFrame(pts)).skip, true, "ratio 1: no anisotropy (#940: skipped, and said)");
});

test("#881 with the trend the surface stays exact at the inputs and carries the middle line's bump further along the trend", () => {
  const north = { dip: 0, dipAzimuth: 90, pitch: 0, ratios: { max: 4, int: 1, min: 1 } };
  const iso = fitExplicitSurface(pts, { frame: "map", resolution: 80 });
  const an = fitExplicitSurface(pts, { frame: "map", resolution: 80, trend: north });
  assert.equal(iso.trend, null);
  assert.ok(an.trend && an.trend.ratio === 4);
  assert.ok(an.residualMax < 1e-6, `residual ${an.residualMax}`);
  // 150 m north of the bump (along the trend) more of it is kept than without the trend (measured: 24.0 vs 17.4 m)
  const at = (res, x, y) => { let best = null, d = Infinity; for (let i = 0; i < res.positions.length; i += 3) { const e = Math.hypot(res.positions[i] - x, res.positions[i + 1] - y); if (e < d) { d = e; best = res.positions[i + 2]; } } return best; };
  const isoN = at(iso, 500, 350) - z(500), anN = at(an, 500, 350) - z(500);
  assert.ok(anN > isoN + 3, `along the trend: ${anN.toFixed(1)} with, ${isoN.toFixed(1)} without`);
});

test("#881 the export stamp names the trend", () => {
  const l = provenanceLines("Top", { tool: "explicit surface (thin-plate spline exactly through hand-picked contacts)", picks: 3, sectionLines: 0, points: 3, trend: { name: "GnD", ratio: 3, alongAzimuthDeg: 175 } }).join("\n");
  assert.match(l, /Structural trend "GnD": the spline is 3 times smoother along 175 deg/);
  assert.ok(!/Other parameters/.test(l), l);
});

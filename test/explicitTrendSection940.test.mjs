// TASKS.csv #940 — an explicit surface's in-plane anisotropy is the section of the trend ellipsoid by the surface's plane
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface, surfaceFrame, trendInPlane } from "../src/lib/explicitSurface.js";

const flat = [];
for (let x = 0; x <= 1000; x += 250) for (let y = 0; y <= 1000; y += 250) flat.push({ x, y, z: 100 + 0.01 * x });
const F = surfaceFrame(flat, { frame: "map" });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const azNear = (a, b, tol) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d) <= tol; };

test("#940 the review's cases on a flat contact: the section's long axis and ratio", () => {
  // steep vein-set trend 70 -> 090, pitch 90, 3:2:1: the old projection applied 1.5x along 090; the section is 1.89x along 000
  const steep = trendInPlane({ dip: 70, dipAzimuth: 90, pitch: 90, ratios: { max: 3, int: 2, min: 1 } }, F);
  assert.ok(near(steep.ratio, 1.89, 0.01) && azNear(steep.azimuthDeg, 0, 1), JSON.stringify(steep));
  const mid = trendInPlane({ dip: 45, dipAzimuth: 90, pitch: 90, ratios: { max: 3, int: 2, min: 1 } }, F);
  assert.ok(near(mid.ratio, 1.49, 0.01) && azNear(mid.azimuthDeg, 0, 1), JSON.stringify(mid));
  // a horizontal trend lying in the plane: the full max / int
  const hz = trendInPlane({ dip: 0, dipAzimuth: 90, pitch: 0, ratios: { max: 3, int: 2, min: 1 } }, F);
  assert.ok(near(hz.ratio, 1.5, 1e-9) && azNear(hz.azimuthDeg, 0, 1e-6));
});

test("#940 a trend nearly round in the plane is skipped and the fit says so", () => {
  const shallow = { dip: 20, dipAzimuth: 90, pitch: 90, ratios: { max: 3, int: 2, min: 1 } }; // section 1.08x
  assert.equal(trendInPlane(shallow, F).skip, true);
  const res = fitExplicitSurface(flat, { frame: "map", resolution: 30, trend: shallow });
  assert.equal(res.trend, null);
  assert.ok(res.warnings.some((w) => /almost round within this surface's plane/.test(w)), res.warnings.join(" | "));
});

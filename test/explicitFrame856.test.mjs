// TASKS.csv #856 — picks taken along drill sections (a fence) must not be modelled as a vertical sheet standing in the
// section: the holes' directions at the picks tell the drilling plane from a steep contact. Cases from the #855 review.
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface, surfaceFrame } from "../src/lib/explicitSurface.js";

const rad = (d) => (d * Math.PI) / 180;
// a hole drilled from (x0, y0, 1000) at dip `dip` towards azimuth `az`; where it meets z = f(x, y), found by stepping
function pickOnHole(x0, y0, az, dip, f) {
  const d = [Math.sin(rad(az)) * Math.cos(rad(dip)), Math.cos(rad(az)) * Math.cos(rad(dip)), -Math.sin(rad(dip))];
  for (let s = 0; s < 3000; s += 0.05) {
    const x = x0 + d[0] * s, y = y0 + d[1] * s, z = 1000 + d[2] * s;
    if (z <= f(x, y)) return { x, y, z, dir: d };
  }
  return null;
}
const synform = (x) => 900 + 0.0012 * (x - 250) ** 2; // limbs about 31 deg

test("#856 one drill section: refused with the fence message, not built as a vertical sheet", () => {
  const picks = [0, 100, 200, 300, 400, 500].map((x) => pickOnHole(x, 0, 90, 60, (px) => synform(px)));
  assert.equal(surfaceFrame(picks).fence, true);
  assert.equal(surfaceFrame(picks).steep, false);
  assert.throws(() => fitExplicitSurface(picks), /plane of one drill section/);
  // without hole directions (free 3D points) the old rule stands: a steep plane (the user can say otherwise with Shape)
  assert.equal(surfaceFrame(picks.map(({ dir, ...p }) => p)).steep, true);
});

test("#856 two sections 50 m apart over a synform: map frame, every pick kept (6 of 12 were dropped)", () => {
  const picks = [0, 50].flatMap((y) => [0, 100, 200, 300, 400, 500].map((x) => pickOnHole(x, y, 90, 60, (px) => synform(px))));
  const res = fitExplicitSurface(picks);
  assert.equal(res.frame.steep, false);
  assert.equal(res.frame.fence, true);
  assert.equal(res.n, 12);
  assert.equal(res.warnings.length, 0);
  // the mesh follows the fold between the sections
  let worst = 0;
  for (let k = 0; k < res.positions.length; k += 3) {
    const x = res.positions[k], y = res.positions[k + 1], z = res.positions[k + 2];
    if (x >= 20 && x <= 480 && y >= 0 && y <= 50) worst = Math.max(worst, Math.abs(z - synform(x)));
  }
  assert.ok(worst < 6, `inside the picks the mesh is within ${worst.toFixed(1)} m of the fold`);
});

test("#856 a real steep contact (70 deg) crossed by its holes keeps the plane frame", () => {
  // contact: plane through (250, 0, 900) dipping 70 deg towards east; holes drilled west at -50 from collars east of it
  const plane = (x) => 900 - (x - 250) * Math.tan(rad(70));
  const picks = [];
  for (const y of [0, 100, 200]) for (const x0 of [320, 380, 440]) { const p = pickOnHole(x0, y, 270, 50, (x) => plane(x)); if (p) picks.push(p); }
  assert.ok(picks.length >= 6);
  const F = surfaceFrame(picks);
  assert.equal(F.fence, false, "the holes cross the contact");
  assert.equal(F.steep, true);
  assert.ok(Math.abs(F.dip - 70) < 0.5);
  assert.ok(fitExplicitSurface(picks).residualMax < 1e-6);
});

test("#856 a strip of picks 500 x 4 m is refused in the map frame (the spline swung 1,056 m across it)", () => {
  const strip = [0, 100, 200, 300, 400, 500].map((x, i) => ({ x, y: i % 2 ? 2 : -2, z: 900 + 30 * Math.sin(x / 80) }));
  assert.throws(() => fitExplicitSurface(strip, { frame: "map" }), /along one line/);
});

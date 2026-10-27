// TASKS.csv #977 — an explicit surface's extrapolated margin is shaded: the fit records the inputs' hull, and each vertex
// outside it gets the darker colour factor; the saved (compact) hull gives the same shading on a reopened project
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface } from "../src/lib/explicitSurface.js";
import { supportShadeFactors, compactHull, EXTRAPOLATED_SHADE } from "../src/lib/explicitSupport.js";

const E0 = 500000, N0 = 6200000;
// 40 picks over 800 x 600 m, gently dipping, at UTM coordinates
const picks = [];
for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) picks.push({ x: E0 + i * 110 + (j % 2) * 20, y: N0 + j * 150, z: 1000 - 0.1 * i * 110, src: "pick" });

test("#977 the shaded share of the vertices matches the fit's extrapolated share", () => {
  const res = fitExplicitSurface(picks, { resolution: 40 });
  assert.ok(res.supportHull && res.supportHull.uv.length >= 8);
  const f = supportShadeFactors(res.positions, res.supportHull);
  const n = res.positions.length / 3;
  let dark = 0;
  for (let k = 0; k < n; k++) if (f[3 * k] === EXTRAPOLATED_SHADE) dark++;
  // the fit's figure counts grid nodes only; the shaded share over all vertices is close to it
  assert.ok(Math.abs((100 * dark) / n - res.quality.beyondPct) < 10, `${(100 * dark) / n} vs ${res.quality.beyondPct}`);
  assert.ok(dark > 0 && dark < n);
  // a vertex well outside the picks' extent is shaded
  const out = supportShadeFactors(Float64Array.from([E0 - 100, N0 - 100, 1000, E0 + 400, N0 + 300, 980]), res.supportHull);
  assert.deepEqual(Array.from(out), [EXTRAPOLATED_SHADE, EXTRAPOLATED_SHADE, EXTRAPOLATED_SHADE, 1, 1, 1]);
});

test("#977 the compact hull saved with the surface shades a reopened mesh the same way", () => {
  const res = fitExplicitSurface(picks, { resolution: 40 });
  const a = supportShadeFactors(res.positions, res.supportHull);
  const b = supportShadeFactors(res.positions, JSON.parse(JSON.stringify(compactHull(res.supportHull))));
  let diff = 0;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diff++;
  assert.ok(diff <= 3 * 2, `${diff / 3} vertices differ`); // a vertex exactly on the hull may flip with cm rounding
  assert.equal(supportShadeFactors(res.positions, null), null);
});

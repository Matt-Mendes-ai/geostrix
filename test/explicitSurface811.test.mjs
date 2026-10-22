// TASKS.csv #811 — explicit surfaces: exact through every pick and section line, steep surfaces, guard rails
import test from "node:test";
import assert from "node:assert/strict";
import { explicitPoints, fitExplicitSurface, surfaceFrame, thinPlate } from "../src/lib/explicitSurface.js";

// barycentric height of the mesh at (x, y) — the surface as it is drawn, not the spline
function meshZ(res, x, y) {
  const P = res.positions, I = res.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const d = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((P[b + 1] - P[c + 1]) * (x - P[c]) + (P[c] - P[b]) * (y - P[c + 1])) / d;
    const l2 = ((P[c + 1] - P[a + 1]) * (x - P[c]) + (P[a] - P[c]) * (y - P[c + 1])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2];
  }
  return NaN;
}

const E0 = 612000, N0 = 5790000;
const picks = [[0, 0, 900], [400, 0, 880], [0, 400, 870], [400, 400, 860], [200, 200, 820], [120, 310, 905]].map(([x, y, z], i) => ({ id: `p${i}`, x: E0 + x, y: N0 + y, z }));

test("#811 thin-plate spline reproduces a plane and is exact at its points", () => {
  const u = [0, 1, 0, 1, 0.3], v = [0, 0, 1, 1, 0.6], w = u.map((x, i) => 2 * x - 3 * v[i] + 5);
  const f = thinPlate(u, v, w);
  assert.ok(Math.abs(f(0.5, 0.5) - (1 - 1.5 + 5)) < 1e-9);
  w[4] += 1; const g = thinPlate(u, v, w);
  assert.ok(Math.abs(g(0.3, 0.6) - w[4]) < 1e-9);
});

test("#811 the MESH passes exactly through every pick (UTM coordinates) and the residual is ~0", () => {
  const pts = explicitPoints({ name: "Top A", picks }, []).points;
  const res = fitExplicitSurface(pts, { resolution: 30 });
  assert.equal(res.frame.steep, false);
  assert.ok(res.residualMax < 1e-6, `residual ${res.residualMax}`);
  for (const p of picks) assert.ok(Math.abs(meshZ(res, p.x, p.y) - p.z) < 1e-6, `pick ${p.id}`);
  // the low pick in the middle is a real low, not smoothed away
  assert.ok(meshZ(res, E0 + 200, N0 + 200) < 830);
});

test("#811 a drawn section contact tagged with the surface's name is a densified hard line", () => {
  const sections = [{ name: "S1", contacts: [
    { unit: "Top A", kind: "contact", isUpperContact: true, points: [{ x: E0 + 50, y: N0 + 100, z: 890 }, { x: E0 + 350, y: N0 + 100, z: 870 }] },
    { unit: "Top A", kind: "fault", isUpperContact: false, points: [{ x: E0, y: N0, z: 0 }, { x: E0 + 1, y: N0, z: 0 }] },
    { unit: "Other", kind: "contact", isUpperContact: true, points: [{ x: E0, y: N0, z: 0 }, { x: E0 + 1, y: N0, z: 0 }] }] }];
  const ep = explicitPoints({ name: "Top A", picks }, sections, { spacing: 10 });
  assert.equal(ep.lines, 1);
  assert.equal(ep.points.length, picks.length + 2 + 30); // 300.7 m long: 30 points between the two vertices keep every gap <= 10 m
  const res = fitExplicitSurface(ep.points, { resolution: 25 });
  for (const x of [50, 123, 200, 349]) {
    const zLine = 890 + ((x - 50) / 300) * -20;
    assert.ok(Math.abs(meshZ(res, E0 + x, N0 + 100) - zLine) < 0.05, `x=${x}: ${meshZ(res, E0 + x, N0 + 100)} vs ${zLine}`);
  }
  // the spacing grows to respect maxPoints
  const capped = explicitPoints({ name: "Top A", picks }, sections, { spacing: 1, maxPoints: 20 });
  assert.ok(capped.points.length <= 20);
});

test("#811 a steep (80°) surface is modelled over its own plane, through every point", () => {
  // plane dipping 80° towards E: x = 0.176 * depth; points scattered on it with a bump
  const pts = [];
  for (const [s, d] of [[0, 0], [300, 0], [0, 300], [300, 300], [150, 150], [80, 240], [220, 60]]) {
    const z = 1000 - d, x = Math.tan((10 * Math.PI) / 180) * d + (s === 150 ? 15 : 0);
    pts.push({ x: E0 + x, y: N0 + s, z });
  }
  const fr = surfaceFrame(pts);
  assert.equal(fr.steep, true);
  assert.ok(fr.dip > 70 && fr.dip < 90, `dip ${fr.dip}`);
  const res = fitExplicitSurface(pts, { resolution: 20 });
  assert.ok(res.residualMax < 1e-6);
  const P = res.positions;
  for (const p of pts) {
    let best = Infinity;
    for (let k = 0; k < P.length; k += 3) best = Math.min(best, Math.hypot(P[k] - p.x, P[k + 1] - p.y, P[k + 2] - p.z));
    assert.ok(best < 1e-6, "every point is a mesh vertex");
  }
});

test("#811 guard rails: too few points, all on one line, stacked picks", () => {
  assert.throws(() => fitExplicitSurface(picks.slice(0, 2)), /at least 3/);
  const line = [0, 100, 200, 300].map((x) => ({ x: E0 + x, y: N0, z: 900 - x / 10 }));
  assert.throws(() => fitExplicitSurface(line), /one line/);
  const res = fitExplicitSurface([...picks, { x: E0 + 200, y: N0 + 200, z: 700 }], { resolution: 10 });
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /straight above or below/);
});

test("#811 cut at the ground: nothing above the terrain", () => {
  const groundAt = (x) => (x - E0 < 200 ? 875 : NaN); // west half has terrain at 875; east half has none
  const res = fitExplicitSurface(explicitPoints({ name: "Top A", picks }, []).points, { resolution: 30, groundAt });
  assert.ok(res.groundCut > 0);
  const P = res.positions;
  for (let k = 0; k < P.length; k += 3) if (P[k] - E0 < 199) assert.ok(P[k + 2] <= 875 + 0.05, `z ${P[k + 2]}`);
});

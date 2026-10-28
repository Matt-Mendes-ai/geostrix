// TASKS.csv #1039 (review #1016) — the planned-hole checks give the same answers as the brute-force version they replace,
// name / notes edits do not change the memo key, and the pierce-point angle comes from the triangle the hole crosses.
import test from "node:test";
import assert from "node:assert/strict";
import { planGeometryKey, drilledTraceIndex, isTargetModel, targetBandIndex, planChecks } from "../src/lib/plannedHoleChecks.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { plannedTrace } from "../src/lib/holePlanning.js";
import { piercePoints } from "../src/lib/piercePoints.js";

// the code that was in ViewerModule (planCollisionAndTargetChecks), without its support-cutoff call (no support here)
function bruteForce(plannedHoles, collars, survey, voxelModels, method) {
  const realTraces = collars.map((c) => ({ hole_id: c.hole_id, pts: desurveyHole(c, survey.filter((s) => s.hole_id === c.hole_id && !isNaN(s.depth)), method) })).filter((t) => t.pts.length);
  const targetModels = voxelModels.filter((m) => Number.isFinite(m.threshold) && Number.isFinite(m.rangeMax) && (m.threshold > m.min || m.rangeMax < m.max));
  return plannedHoles.map((hole) => {
    const pts = plannedTrace(hole);
    let nearestReal = null;
    realTraces.forEach((rt) => {
      let best = Infinity;
      pts.forEach((p) => { rt.pts.forEach((q) => { const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); if (d < best) best = d; }); });
      if (best < Infinity && (!nearestReal || best < nearestReal.distance)) nearestReal = { hole_id: rt.hole_id, distance: best };
    });
    const targetHits = targetModels.map((model) => {
      const cells = model.cells.filter((c) => c.value >= model.threshold && c.value <= model.rangeMax);
      let metres = 0;
      for (let i = 1; i < pts.length; i++) {
        const mid = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2, z: (pts[i].z + pts[i - 1].z) / 2 };
        if (cells.some((c) => Math.abs(mid.x - c.x) <= c.dx / 2 && Math.abs(mid.y - c.y) <= c.dy / 2 && Math.abs(mid.z - c.z) <= c.dz / 2)) metres += pts[i].md - pts[i - 1].md;
      }
      return { modelId: model.id, modelName: model.name, metres };
    }).filter((h) => h.metres > 0);
    return { hole, nearestReal, targetHits };
  });
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const collars = Array.from({ length: 40 }, (_, i) => ({ hole_id: `DH${i}`, x: 500000 + rnd() * 2000, y: 6000000 + rnd() * 2000, z: 1000 + rnd() * 50, azimuth: rnd() * 360, dip: 45 + rnd() * 45, length: 100 + rnd() * 300 }));
const survey = collars.flatMap((c) => [0, 50, 100].map((d) => ({ hole_id: c.hole_id, depth: d, azimuth: c.azimuth + d * 0.05, dip: c.dip - d * 0.02 })));
const planned = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Plan ${i}`, notes: "", x: 500000 + rnd() * 2000, y: 6000000 + rnd() * 2000, z: 1010, azimuth: rnd() * 360, dip: -(50 + rnd() * 30), length: 300 })),
  { id: "far", name: "Far away", x: 515000, y: 6012000, z: 1000, azimuth: 90, dip: -60, length: 200 }, // ~18 km from everything: the fallback search
];
const cells = [];
for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) for (let k = 0; k < 12; k++) cells.push({ x: 500025 + i * 50, y: 6000025 + j * 50, z: 1000 - 12.5 - k * 25, dx: 50, dy: 50, dz: 25, value: (i * 7 + j * 3 + k * 5) % 100 });
cells.push({ x: 501000, y: 6001000, z: 800, dx: 200, dy: 200, dz: 100, value: 95 }); // one big block among small ones
const models = [{ id: "m1", name: "Res", min: 0, max: 99, threshold: 80, rangeMax: 99, cells }, { id: "m2", name: "Whole", min: 0, max: 99, threshold: 0, rangeMax: 99, cells }];

test("#1039 same nearest hole, distance and target metres as the brute-force checks", () => {
  const want = bruteForce(planned, collars, survey, models, "minimum_curvature");
  const got = planChecks(planned, drilledTraceIndex(collars, survey, "minimum_curvature"), models.filter(isTargetModel).map(targetBandIndex));
  assert.equal(got.length, want.length);
  got.forEach((g, i) => {
    const w = want[i];
    assert.equal(g.nearestReal.hole_id, w.nearestReal.hole_id, g.hole.id);
    assert.ok(Math.abs(g.nearestReal.distance - w.nearestReal.distance) < 1e-9, g.hole.id);
    assert.deepEqual(g.targetHits.map((h) => [h.modelId, +h.metres.toFixed(6)]), w.targetHits.map((h) => [h.modelId, +h.metres.toFixed(6)]), g.hole.id);
  });
  assert.ok(got.some((g) => g.targetHits.length), "some plan crosses the band");
  assert.ok(want[8].nearestReal.distance > 10000);
  assert.equal(models.filter(isTargetModel).length, 1); // an un-narrowed model is not a target band
});

test("#1039 the memo key ignores name and notes, and follows the geometry", () => {
  const k = planGeometryKey(planned);
  assert.equal(planGeometryKey(planned.map((h) => ({ ...h, name: h.name + "x", notes: "typing" }))), k);
  assert.notEqual(planGeometryKey(planned.map((h, i) => (i ? h : { ...h, azimuth: h.azimuth + 1 }))), k);
  assert.notEqual(planGeometryKey(planned.map((h, i) => (i ? h : { ...h, lift: 1 }))), k);
});

test("#1039 the pierce angle is the crossed triangle's: a 30° dipping plane met by a vertical hole is 60°", () => {
  // a plane dipping 30° east, as a fine triangle grid
  const n = 60, s = 10, positions = [], indices = [];
  const tan30 = Math.tan(Math.PI / 6);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = i * s, y = j * s; positions.push(x, y, 500 - x * tan30); }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; indices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1); }
  const surf = { id: "s", name: "Contact", positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  const trace = [{ md: 0, x: 301, y: 302, z: 600 }, { md: 400, x: 301, y: 302, z: 200 }];
  const [p] = piercePoints(trace, [surf]);
  assert.ok(p, "one crossing");
  assert.ok(Math.abs(p.angle - 60) < 1e-3, String(p.angle));
  assert.ok(Math.abs(p.z - (500 - 301 * tan30)) < 1e-3);
  const t0 = performance.now();
  for (let r = 0; r < 200; r++) piercePoints(trace, [surf]);
  assert.ok((performance.now() - t0) / 200 < 5, "a crossing costs no scan of every triangle");
});

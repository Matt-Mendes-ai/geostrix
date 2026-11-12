// TASKS.csv #2422 (review #2325, WA uranium) — the Estimation dialog's block budget counted blocks the run can never fill: a flat
// structural trend (10 : 10 : 1, radius 200) reaches 20 m up and down, not 200 m (850,623 counted, 54,596 estimated), and with 'Restrict
// to a modelled volume' only the samples inside the solid inform the run (797,492 counted at 10 m for a run that kept 3,702 blocks).
// #2636 — the count is now made from trace segments (exact capsules), which is also what made it fast.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blockReach, segmentReach, tracesToSegments, densifyTraces, reachSummary, verticalReach } from "../src/lib/blockReach.js";
import { clipTracesToSolid, reachArgsWithSolid, solidQuery } from "../src/lib/reachSolid.js";
import { buildMeshQuery, isPointInsideMesh } from "../src/lib/meshQuery.js";
import { trendBasis, trendSearchScales } from "../src/lib/trend.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// a closed, outward-facing box
function box(x0, y0, z0, x1, y1, z1) {
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) };
}

test("#2636: the segment count is the exact reach of the traces (randomized against points every 5 cm)", () => {
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 15; trial++) {
    const traces = [];
    for (let h = 0; h < 4; h++) { const p = [{ x: rnd() * 200, y: rnd() * 200, z: 50 }]; for (let k = 0; k < 2; k++) { const q = p[p.length - 1]; p.push({ x: q.x + (rnd() - 0.5) * 60, y: q.y + (rnd() - 0.5) * 60, z: q.z - rnd() * 60 }); } traces.push(p); }
    const b = { xmin: -40, xmax: 240, ymin: -40, ymax: 240, zmin: -150, zmax: 90 };
    const cell = { dx: 6 + rnd() * 8, dy: 6 + rnd() * 8, dz: 3 + rnd() * 8 }, R = 10 + rnd() * 40, rz = trial % 2 ? R * 0.2 : null;
    const seg = segmentReach(tracesToSegments(traces), b, cell, R, { rz });
    const truth = blockReach(densifyTraces(traces, 0.05).points, b, cell, R, { rz });
    for (let i = 0; i < truth.mask.length; i++) assert.ok(!truth.mask[i] || seg.mask[i], `trial ${trial}: block ${i} reached by a trace point is counted`);
    assert.ok(seg.reach <= truth.reach * 1.01 + 3, `trial ${trial}: ${seg.reach} vs ${truth.reach}`);
  }
});

test("#2422: a flat structural trend counts its own vertical reach (the estimator's verticalReach), not the sphere", () => {
  const t = { dip: 0, dipAzimuth: 0, pitch: 0, ratios: { max: 10, int: 10, min: 1 } };
  const rz = verticalReach(200, { basis: trendBasis(t), scales: trendSearchScales(t) });
  assert.ok(Math.abs(rz - 20) < 1e-6, String(rz));
  const tilted = { dip: 60, dipAzimuth: 90, pitch: 0, ratios: { max: 10, int: 10, min: 1 } };
  assert.equal(verticalReach(200, { basis: trendBasis(tilted), scales: trendSearchScales(tilted) }), null, "a tilted ellipsoid keeps the sphere, as the estimator does");
  // 30 vertical holes 40 m apart, 100 m deep; a 200 m search on 10 m cells over a box 300 m high
  const traces = []; for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) traces.push([{ x: i * 40, y: j * 40, z: 0 }, { x: i * 40, y: j * 40, z: -100 }]);
  const b = { xmin: -250, xmax: 450, ymin: -250, ymax: 410, zmin: -300, zmax: 0 }, cell3 = { dx: 10, dy: 10, dz: 10 };
  const sphere = reachSummary({ traces, bounds: b, cell3, radius: 200, budget: 1e9, from: 10 });
  const flat = reachSummary({ traces, bounds: b, cell3, radius: 200, rz, budget: 1e9, from: 10 });
  assert.ok(flat.reach < sphere.reach * 0.6, `${flat.reach} vs ${sphere.reach}`);
});

test("#2422: with a restricting solid only the trace parts inside it count", () => {
  const traces = [[{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -200 }], [{ x: 300, y: 0, z: 0 }, { x: 300, y: 0, z: -200 }]];
  const solid = { key: "box-a", ...box(-20, -20, -120, 40, 20, -60) }; // around the first hole, 60 m of it
  const q = buildMeshQuery(solid.positions, solid.indices);
  const c = clipTracesToSolid(traces, q, 2.5);
  assert.ok(c.segments.length === 1, JSON.stringify(c.segments));
  const [, , za, , , zb] = c.segments[0];
  assert.ok(Math.max(za, zb) <= -60 + 1e-9 && Math.min(za, zb) >= -120 - 1e-9 && Math.max(za, zb) - Math.min(za, zb) >= 55, JSON.stringify(c.segments[0]));
  const bounds = { xmin: -60, xmax: 360, ymin: -60, ymax: 60, zmin: -260, zmax: 40 }, cell3 = { dx: 5, dy: 5, dz: 5 }, radius = 30;
  const all = reachSummary({ traces, bounds, cell3, radius, budget: 1e9, from: 5 });
  const inside = reachSummary(reachArgsWithSolid({ traces, bounds, cell3, radius, budget: 1e9, from: 5, solid }));
  assert.ok(inside.reach < all.reach / 3, `${inside.reach} vs ${all.reach}`);
  // still a superset of what the run's inside samples reach (the estimator counts from them)
  const pts = densifyTraces(traces, 0.5).points.filter((p) => isPointInsideMesh(q, p));
  const samples = blockReach(pts, bounds, cell3, radius);
  assert.ok(inside.reach >= samples.reach, `${inside.reach} >= ${samples.reach}`);
  // the worker keeps the mesh query: later requests name the solid by key only
  assert.equal(solidQuery({ key: "box-a" }), solidQuery(solid));
  assert.equal(solidQuery({ key: "another" }), null);
});

test("#2422: the client sends a solid's mesh to the worker once", async () => {
  const sent = [];
  globalThis.Worker = class { postMessage(m) { sent.push(m); setTimeout(() => this.onmessage?.({ data: { id: m.id, result: {} } }), 1); } terminate() {} };
  const { makeReachClient } = await import("../src/lib/blockReachClient.js?solid");
  const c = makeReachClient(), solid = { key: "s1", ...box(0, 0, 0, 1, 1, 1) };
  await c.request({ solid }).promise; await c.request({ solid }).promise;
  assert.ok(sent[0].args.solid.positions && !sent[1].args.solid.positions && sent[1].args.solid.key === "s1");
  c.stop(); delete globalThis.Worker;
});

test("#2422: the dialog passes the trend's vertical reach and the restricting solid to the count, and says what it counted", () => {
  const m = fs.readFileSync(path.join(root, "src", "components", "GradeEstimationModal.jsx"), "utf8");
  assert.match(m, /const reachRz = flatTrend \? flatReach : modelTrend && reachRadius \? verticalReach\(reachRadius, \{ basis: trendBasis\(modelTrend\), scales: trendSearchScales\(modelTrend\) \}\) : null;/);
  assert.match(m, /rz: reachRz, \.\.\.\(modelTrend && !flatTrend \? \{ metric: \{ basis: trendBasis\(modelTrend\), scales: trendSearchScales\(modelTrend\) \} \} : \{\}\) \/\* #2696[^*]*\*\/, \.\.\.\(reachSolid \? \{ solid: reachSolid \} : \{\}\)/); // #2696: and the trend's metric
  assert.match(m, /reachArgs\.rz, reachArgs\.metric \?\? null \/\* #2696 \*\/, reachSolid\?\.key \?\? null,/); // a new solid is a new count; a new trend too (#2696)
  assert.ok(m.includes('tr(", {n} within reach of the drilling inside \\"{name}\\" (only those can be estimated, and only those count)"'));
});

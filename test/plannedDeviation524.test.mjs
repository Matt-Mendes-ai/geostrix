// TASKS.csv #524 — planned holes with expected lift / drift, and aiming off so the curved hole hits the target.
import test from "node:test";
import assert from "node:assert/strict";
import { plannedTrace, solveWithDeviation, solveOrientationToTarget, missDistanceToTarget, deviationStations } from "../src/lib/holePlanning.js";

// independent check: integrate the direction (dip linear in depth, user convention) in 1 cm steps
function integrate(h, L) {
  let x = h.x, y = h.y, z = h.z;
  for (let md = 0; md < L; md += 0.01) {
    const dip = ((h.dip + (h.lift * (md + 0.005)) / 100) * Math.PI) / 180, az = ((h.azimuth + (h.drift * (md + 0.005)) / 100) * Math.PI) / 180;
    x += 0.01 * Math.cos(dip) * Math.sin(az); y += 0.01 * Math.cos(dip) * Math.cos(az); z += 0.01 * Math.sin(dip);
  }
  return { x, y, z };
}

test("#524 straight hole unchanged without lift / drift", () => {
  const t = plannedTrace({ x: 0, y: 0, z: 1000, azimuth: 90, dip: -60, length: 500 });
  const toe = t[t.length - 1];
  assert.ok(Math.abs(toe.x - 250) < 1e-6 && Math.abs(toe.z - (1000 - 500 * Math.sin(Math.PI / 3))) < 1e-6);
});

test("#524 2°/100 m lift on a 500 m -60° hole: toe where the curved path really ends", () => {
  const h = { x: 0, y: 0, z: 1000, azimuth: 90, dip: -60, length: 500, lift: 2, drift: 0 };
  const t = plannedTrace(h), toe = t[t.length - 1], want = integrate(h, 500);
  assert.ok(Math.hypot(toe.x - want.x, toe.y - want.y, toe.z - want.z) < 0.5, JSON.stringify({ toe, want }));
  const straight = { x: 250, z: 1000 - 500 * Math.sin(Math.PI / 3) };
  const shift = Math.hypot(toe.x - straight.x, toe.z - straight.z);
  assert.ok(shift > 35 && shift < 50, String(shift)); // ~43 m: the toe rides up and out
  assert.equal(deviationStations(h)[50].dip, 50); // internal positive-down: -60 + 2 x 5 = -50 at 500 m
});

test("#524 the aim-off solution hits the target with the deviated hole (< 1 m); the straight aim misses", () => {
  const collar = { x: 1000, y: 2000, z: 1200 }, target = { x: 1300, y: 2100, z: 800 };
  const dev = { lift: 2.5, drift: 1.5 };
  const s = solveWithDeviation(collar, target, dev);
  assert.ok(s.miss < 1, JSON.stringify(s));
  const hit = missDistanceToTarget(plannedTrace({ ...collar, azimuth: s.azimuth, dip: s.dip, length: s.length + 30, ...dev }), target);
  assert.ok(hit.distance < 1);
  const st = solveOrientationToTarget(collar, target);
  const straightMiss = missDistanceToTarget(plannedTrace({ ...collar, azimuth: st.azimuth, dip: st.dip, length: st.length + 30, ...dev }), target);
  assert.ok(straightMiss.distance > 10, String(straightMiss.distance));
});

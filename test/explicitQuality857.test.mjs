// TASKS.csv #857 / #870 — the explicit surface's quality report: leave-one-out by Rippa's formula (checked against N
// refits), the overshoot between inputs that disagree (the #855 review's pick 3 m beside a line and 8 m above it), and
// the extrapolated share of the surface.
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface, thinPlate, thinPlateLoo } from "../src/lib/explicitSurface.js";

let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("#857 Rippa's leave-one-out equals refitting without each point", () => {
  const u = [], v = [], w = [];
  for (let i = 0; i < 25; i++) { const x = rnd() * 400, y = rnd() * 400; u.push(x); v.push(y); w.push(900 + 0.1 * x + 20 * Math.sin(y / 60)); }
  const e = thinPlateLoo(u, v, w);
  for (let k = 0; k < u.length; k++) {
    const f = thinPlate(u.filter((_, i) => i !== k), v.filter((_, i) => i !== k), w.filter((_, i) => i !== k));
    const brute = f(u[k], v[k]) - w[k];
    assert.ok(Math.abs(Math.abs(e[k]) - Math.abs(brute)) < 1e-6, `point ${k}: ${e[k]} vs ${brute}`);
  }
});

test("#857 a plane: leave-one-out ~0, no overshoot warning; part of the surface reported as extrapolated", () => {
  const pts = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) pts.push({ x: i * 50, y: j * 50, z: 1000 - 0.3 * i * 50, src: "pick", hole: `H${i}${j}`, md: 100 });
  const r = fitExplicitSurface(pts);
  assert.ok(r.quality.looRmsM < 1e-6 && r.quality.looMaxM < 1e-6);
  assert.equal(r.warnings.length, 0);
  assert.ok(r.quality.overshootM < 1e-6);
  assert.ok(r.quality.beyondPct > 10 && r.quality.beyondPct < 60, `${r.quality.beyondPct} % beyond`);
  assert.ok(r.quality.furthestM > 20, "the auto margin reaches beyond the picks");
});

test("#857 a pick 3 m beside a section line and 8 m above it: the overshoot is reported and leave-one-out names it", () => {
  const pts = [];
  for (const y of [0, 200]) for (let x = 0; x <= 500; x += 10) pts.push({ x, y, z: 700, src: "section", ref: y ? "B" : "A" });
  pts.push({ x: 250, y: 3, z: 708, src: "pick", hole: "DDH-7", md: 120.4 });
  const r = fitExplicitSurface(pts);
  assert.ok(r.quality.overshootM > 30, `overshoot ${r.quality.overshootM.toFixed(1)} m`);
  assert.ok(r.warnings.some((t) => /swings \d+ m beyond them/.test(t)));
  assert.ok(r.quality.looMaxM > 5);
  const w = r.quality.looWorst;
  assert.ok(w.hole === "DDH-7" || (w.src === "section" && w.ref === "A"), "the worst input is the pick or the line point beside it");
});

test("#857 leave-one-out is skipped above the cap, and the report costs little at the cap", () => {
  const pts = [];
  for (let i = 0; i < 301; i++) pts.push({ x: rnd() * 1000, y: rnd() * 1000, z: 500 + rnd() * 5 });
  const r = fitExplicitSurface(pts);
  assert.equal(r.quality.looSkipped, true);
  assert.equal(r.quality.looRmsM, null);
  const at300 = pts.slice(0, 300), t0 = performance.now();
  const r3 = fitExplicitSurface(at300);
  assert.ok(r3.quality.looRmsM != null);
  assert.ok(performance.now() - t0 < 2000, "a 300-point build with leave-one-out stays interactive");
});

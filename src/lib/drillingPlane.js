// TASKS.csv #3769 + #3782 (Complete GeoStrix review, a narrow-vein gold project drilled in fans) — the plane fitted to the samples at or above a
// cut-off was the shape of the drilling, not of the grade, and nothing said so. Gold at 0.3, 1 and 3 g/t gave poles 11°, 14° and 16° from the
// plane of ALL the composites (grade ignored), where random draws of as many composites land up to 10°, 16° and 29° away (95 %), and 26, 23 and
// 25 of the 33 holes ran within 30° of the plane: holes drilled to cross a vein lie in the plane that was meant to be the vein. Tin, 99 % of it
// one half-limit value, gave the same plane at its 90th percentile; so did the bare hole traces.
//
// One rule for every fitted plane used as a default (the Grade shell's 'Search along the composites' plane', the estimate's plane search) and for
// the Trends panel's 'Set the plane from': before the plane is used, it is compared with
//  - the plane of all the area's samples, grade ignored (lib/samplesTrend.js, the same fit), and the scatter of that plane's fits to random
//    draws of as many samples (seeded, so a run repeats);
//  - the holes: the angle each hole's axis makes with the plane.
// The plane is "the shape of the drilling" when its pole lies within that scatter (or within FLOOR_DEG, whichever is wider) of the drilling's
// plane, the samples are no flatter than the drilling's draws (their intermediate : minor spread within FLAT_SHARE of the draws' 95th
// percentile; the review's 'ratios within a third'), AND at least HOLE_SHARE of the holes run within HOLE_DEG of it. No one test is enough:
// holes along a steep body (vertical holes through a 65° zone run 25° from it) still test it when the grades lie in a slab of their own, and a
// plane near the drilling's is a real one when the holes cross it.
import { samplesTrend } from "./samplesTrend.js";
import { poleOf } from "./trend.js";

export const DRILL_HOLE_DEG = 30, DRILL_HOLE_SHARE = 0.5, DRILL_FLOOR_DEG = 15, DRILL_DRAWS = 40, DRILL_DRAW_PCT = 0.95, DRILL_PAD_M = 500, DRILL_FLAT_SHARE = 1.5;
const deg = 180 / Math.PI, r1 = (v) => Math.round(v * 10) / 10;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const finite = (p) => [p?.x, p?.y, p?.z].every(Number.isFinite);
const poleAngle = (a, b) => Math.acos(Math.min(1, Math.abs(dot(a, b)))) * deg;

// mulberry32: a small seeded generator (the same draws every run)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// each hole's axis: the largest spread of its points (a hole of 2+ points spanning at least minSpanM); -> [{ hole, axis }]
export function holeAxes(pts, { minSpanM = 5 } = {}) {
  const by = new Map();
  for (const p of pts) { if (p?.hole_id == null || !finite(p)) continue; (by.get(p.hole_id) || by.set(p.hole_id, []).get(p.hole_id)).push(p); }
  const out = [];
  for (const [hole, P] of by) {
    if (P.length < 2) continue;
    const n = P.length, c = P.reduce((m, p) => ({ x: m.x + p.x / n, y: m.y + p.y / n, z: m.z + p.z / n }), { x: 0, y: 0, z: 0 });
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (const p of P) { const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z; xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz; }
    // the largest eigenvector by power iteration (a hole is close to a line: it converges in a few steps)
    let v = { x: 1, y: 1, z: 1 }, len = 0;
    for (let k = 0; k < 30; k++) {
      const w = { x: xx * v.x + xy * v.y + xz * v.z, y: xy * v.x + yy * v.y + yz * v.z, z: xz * v.x + yz * v.y + zz * v.z };
      len = Math.hypot(w.x, w.y, w.z);
      if (!(len > 0)) break;
      v = { x: w.x / len, y: w.y / len, z: w.z / len };
    }
    if (!(len > 0)) continue;
    let lo = Infinity, hi = -Infinity;
    for (const p of P) { const t = (p.x - c.x) * v.x + (p.y - c.y) * v.y + (p.z - c.z) * v.z; if (t < lo) lo = t; if (t > hi) hi = t; }
    if (hi - lo >= minSpanM) out.push({ hole, axis: v });
  }
  return out;
}

// plane: { dip, dipAzimuth, ratios? } (the fitted one; ratios.int : ratios.min = its samples' intermediate : minor spread, uncapped); allPts: every sample of the area, grade ignored ({ x, y, z, hole_id }); n: how many samples
// gave the plane (the size of the random draws); usedPts (optional): those samples, to keep the drilling's points to their area (within padM
// of their box: the fit took the largest drilled area only).
// -> null (too few samples to say) or { drilling: bool, angleDeg, drawDeg, floorDeg, near, flat, drawFlat, flatter, all: { dip, dipAzimuth,
//    ratios, n }, holes, within, medianHoleDeg, draws, n }
export function planeVsDrilling(plane, allPts, n, { usedPts = null, padM = DRILL_PAD_M, draws = DRILL_DRAWS, pct = DRILL_DRAW_PCT, floorDeg = DRILL_FLOOR_DEG, holeDeg = DRILL_HOLE_DEG, holeShare = DRILL_HOLE_SHARE, flatShare = DRILL_FLAT_SHARE, seed = 3782 } = {}) {
  if (!plane || !Number.isFinite(plane.dip) || !Number.isFinite(plane.dipAzimuth)) return null;
  let P = (allPts || []).filter(finite);
  const U = (usedPts || []).filter(finite);
  if (U.length) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of U) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
    P = P.filter((p) => p.x >= x0 - padM && p.x <= x1 + padM && p.y >= y0 - padM && p.y <= y1 + padM && p.z >= z0 - padM && p.z <= z1 + padM);
  }
  const m = Math.max(4, Math.min(Math.round(n) || 0, P.length));
  const all = samplesTrend(P);
  if (!all || P.length < 8) return null;
  const pole = poleOf(plane.dip, plane.dipAzimuth), allPole = poleOf(all.dip, all.dipAzimuth);
  const angleDeg = poleAngle(pole, allPole);
  // random draws of m of the area's samples: how far their plane falls from the drilling's by chance alone
  const rand = rng(seed + m), idx = P.map((_, i) => i), got = [], flats = [];
  if (m < P.length) {
    for (let d = 0; d < draws; d++) {
      for (let i = 0; i < m; i++) { const j = i + Math.floor(rand() * (P.length - i)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      const f = samplesTrend(idx.slice(0, m).map((i) => P[i]));
      if (f) { got.push(poleAngle(poleOf(f.dip, f.dipAzimuth), allPole)); flats.push(f.ratios.int / (f.ratios.min || 1)); }
    }
  }
  got.sort((a, b) => a - b); flats.sort((a, b) => a - b);
  const at = (a) => a[Math.min(a.length - 1, Math.floor(pct * a.length))];
  const drawDeg = got.length ? at(got) : 0;
  // how flat the samples lie (intermediate : minor spread) against the drilling's own and its draws': a slab of grade is flatter than any draw
  const flat = Number(plane.ratios?.int) / (Number(plane.ratios?.min) || 1), drawFlat = Math.max(all.ratios.int / (all.ratios.min || 1), flats.length ? at(flats) : 0);
  const flatter = Number.isFinite(flat) && flat > flatShare * drawFlat;
  // the holes: the angle each axis makes with the plane (90° = square across it)
  const ang = holeAxes(P).map((h) => Math.asin(Math.min(1, Math.abs(dot(h.axis, pole)))) * deg).sort((a, b) => a - b);
  const within = ang.filter((a) => a <= holeDeg).length;
  const medianHoleDeg = ang.length ? ang[Math.floor((ang.length - 1) / 2)] : null;
  const near = angleDeg <= Math.max(drawDeg, floorDeg);
  const drilling = near && !flatter && ang.length > 0 && within >= holeShare * ang.length;
  return { drilling, angleDeg: r1(angleDeg), drawDeg: r1(drawDeg), floorDeg, near, flat: Number.isFinite(flat) ? r1(flat) : null, drawFlat: r1(drawFlat), flatter, all: { dip: all.dip, dipAzimuth: all.dipAzimuth, ratios: all.ratios, n: P.length }, holes: ang.length, within, medianHoleDeg: medianHoleDeg == null ? null : r1(medianHoleDeg), draws: got.length, n: m };
}

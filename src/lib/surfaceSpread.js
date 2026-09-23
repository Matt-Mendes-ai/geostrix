import { arrMin, arrMax } from "./arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
// TASKS.csv #52 (a) — "spread across N realisations": how far a GemPy surface moves when its inputs are
// perturbed by the uncertainty the GEOLOGIST states. Pure, no React / three.js, checked in Node.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. #52's own note recommended against a Bayesian
// "confidence overlay" and set gates for anything built in its place. This module is built to those
// gates, and its vocabulary follows them:
//   * It is a MONTE-CARLO SENSITIVITY ensemble — perturb the interface points and orientations, re-run
//     the same deterministic model, measure how far the result moves. It is not Bayesian inference: no
//     likelihood, no posterior, no pymc. So the output is called a SPREAD, never a confidence or a
//     probability.
//   * The perturbation sizes come from the user (a global sigma they must type in, and optionally a
//     per-pick `uncertainty_m` column on their interval data). Nothing here invents a default sigma: an
//     output driven by a made-up number would be the "confident-looking volume driven by a number
//     GeoStrix made up" the recommendation warned about.
//   * Realisation count is small and time-budgeted by the caller, with the per-run cost measured on the
//     actual first run rather than assumed.
//
// Coordinates here are whatever space the caller hands in; ViewerModule perturbs in API (east, north,
// up) metres, BEFORE its anisotropy warp, so sigma always means real metres / real degrees.

// Deterministic PRNG (mulberry32) so a run can be reproduced from the seed recorded in its params.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box-Muller.
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Interface points: each coordinate moved by N(0, sigma) metres, sigma being the point's own `sigma`
// (from a per-pick uncertainty column) or the run's global value. Isotropic in 3D — a stated
// simplification: a drillhole contact is mostly uncertain ALONG the hole, but which direction that is
// varies per hole and per depth, and a per-axis model would need a per-axis uncertainty nobody records.
export function perturbPoints(points, sigmaDefault, rng) {
  return points.map((p) => {
    const s = Number.isFinite(p.sigma) && p.sigma >= 0 ? p.sigma : sigmaDefault;
    if (!(s > 0)) return { ...p };
    return { ...p, x: p.x + gaussian(rng) * s, y: p.y + gaussian(rng) * s, z: p.z + gaussian(rng) * s };
  });
}

// Orientations: the plane's pole tipped by a random angle whose per-axis standard deviation is
// sigmaDeg, in a random direction. For small angles the angular deviation is Rayleigh-distributed with
// scale sigmaDeg (its RMS is sigmaDeg * sqrt(2)); the Node check verifies that. Dip is returned in
// [0, 180] with the gradient sense preserved — see the comment at the bottom of this function.
export function perturbOrientation(o, sigmaDeg, rng) {
  if (!(sigmaDeg > 0)) return { ...o };
  const d = (o.dip * Math.PI) / 180, a = (o.azimuth * Math.PI) / 180;
  const n = [Math.sin(d) * Math.sin(a), Math.sin(d) * Math.cos(a), Math.cos(d)];
  // Two unit vectors perpendicular to n.
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
  const ul = Math.hypot(...u); u = u.map((c) => c / ul);
  const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const s = (sigmaDeg * Math.PI) / 180;
  const du = gaussian(rng) * s, dw = gaussian(rng) * s;
  const theta = Math.hypot(du, dw);
  let m = n;
  if (theta > 0) {
    const cu = du / theta, cw = dw / theta;
    const axisDir = [u[0] * cu + w[0] * cw, u[1] * cu + w[1] * cw, u[2] * cu + w[2] * cw];
    m = [n[0] * Math.cos(theta) + axisDir[0] * Math.sin(theta), n[1] * Math.cos(theta) + axisDir[1] * Math.sin(theta), n[2] * Math.cos(theta) + axisDir[2] * Math.sin(theta)];
  }
  // The tipped pole is NOT folded back into the upper hemisphere. An orientation here is a GRADIENT
  // with a sense (GemPy reads it as "which side is younger"), not just a plane, and folding a pole that
  // tipped past horizontal reverses that sense. The first version folded, and at realistic sigmas that
  // matters: with sigma 5 deg a steep pick (dip ~85, common in the Harry structure layer) crosses
  // horizontal in a large share of draws, and every such draw silently fed GemPy a gradient pointing the
  // wrong way, mixing polarity flips into what is meant to measure attitude uncertainty.
  // Node check: 0 reversed gradients in 90,000 perturbations of vertical, near-vertical, moderate and
  // near-flat planes at sigma 1e-9 / 1 / 5 deg. Dip may therefore come back above 90 (a downward-pointing
  // gradient); the sidecar builds G = (sin dip sin az, sin dip cos az, cos dip), which represents that
  // correctly, and ViewerModule's anisoWarpDirection uses the same convention.
  const dip = (Math.acos(Math.min(1, Math.max(-1, m[2]))) * 180) / Math.PI;
  let az = (Math.atan2(m[0], m[1]) * 180) / Math.PI;
  if (az < 0) az += 360;
  return { ...o, dip, azimuth: az };
}

// Angle between two orientations' poles, degrees (plane-to-plane, so 0..90).
export function orientationAngleDeg(o1, o2) {
  const pole = (o) => { const d = (o.dip * Math.PI) / 180, a = (o.azimuth * Math.PI) / 180; return [Math.sin(d) * Math.sin(a), Math.sin(d) * Math.cos(a), Math.cos(d)]; };
  const p = pole(o1), q = pole(o2);
  const c = Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2]);
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

// ---------- point-to-mesh distance ----------

// Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). Returns squared
// distance. All arguments are [x, y, z].
function distSqPointTriangle(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const sq = (q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  if (d1 <= 0 && d2 <= 0) return sq(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return sq(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return sq([a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]); }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return sq(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return sq([a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return sq([b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return sq([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

// Distance from every query point to the nearest point of a triangle mesh. verts: [[x,y,z]...],
// faces: [[i,j,k]...]. A uniform grid over the triangles' bounding boxes (cell ~2x the median edge) is
// searched in growing shells until no closer triangle can exist, so this is exact, not approximate.
// A point further than maxDist from every triangle gets Infinity — the caller treats that as "this
// realisation produced no surface near here", which is itself a finding, not a number to average.
export function pointsToMeshDistance(points, verts, faces, { maxDist = Infinity } = {}) {
  if (!faces.length) return points.map(() => Infinity);
  const edges = [];
  for (let i = 0; i < faces.length; i += Math.max(1, Math.floor(faces.length / 500))) {
    const [a, b] = faces[i];
    const A = verts[a], B = verts[b];
    edges.push(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]));
  }
  edges.sort((x, y) => x - y);
  const cell = Math.max(1e-6, (edges[Math.floor(edges.length / 2)] || 1) * 2);
  const key = (i, j, k) => `${i},${j},${k}`;
  const grid = new Map();
  let gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity];
  faces.forEach((f, fi) => {
    const tv = f.map((idx) => verts[idx]);
    const lo = [0, 1, 2].map((ax) => Math.floor(Math.min(tv[0][ax], tv[1][ax], tv[2][ax]) / cell));
    const hi = [0, 1, 2].map((ax) => Math.floor(Math.max(tv[0][ax], tv[1][ax], tv[2][ax]) / cell));
    for (let ax = 0; ax < 3; ax++) { gmin[ax] = Math.min(gmin[ax], lo[ax]); gmax[ax] = Math.max(gmax[ax], hi[ax]); }
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const kk = key(i, j, k);
      let arr = grid.get(kk);
      if (!arr) { arr = []; grid.set(kk, arr); }
      arr.push(fi);
    }
  });
  const maxShell = Math.max(gmax[0] - gmin[0], gmax[1] - gmin[1], gmax[2] - gmin[2]) + 2;
  return points.map((p) => {
    const c = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
    // Shells can start far from the grid if the point is outside it; jump straight to the first shell
    // that can intersect the grid's box.
    const gap = Math.max(0, arrMax([0, 1, 2].map((ax) => Math.max(gmin[ax] - c[ax], c[ax] - gmax[ax]))));
    let best = Infinity;
    const seen = new Set();
    for (let r = gap; r <= gap + maxShell; r++) {
      // Every triangle not yet visited lies at least (r - 1) * cell away.
      if (best !== Infinity && Math.sqrt(best) <= (r - 1) * cell) break;
      if ((r - 1) * cell > maxDist) break;
      for (let i = c[0] - r; i <= c[0] + r; i++) for (let j = c[1] - r; j <= c[1] + r; j++) for (let k = c[2] - r; k <= c[2] + r; k++) {
        if (Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(k - c[2])) !== r) continue; // shell only
        const arr = grid.get(key(i, j, k));
        if (!arr) continue;
        for (const fi of arr) {
          if (seen.has(fi)) continue;
          seen.add(fi);
          const [a, b, cc] = faces[fi];
          const d = distSqPointTriangle(p, verts[a], verts[b], verts[cc]);
          if (d < best) best = d;
        }
      }
    }
    const dist = Math.sqrt(best);
    return dist <= maxDist ? dist : Infinity;
  });
}

// Per-vertex summary across realisations. distances: one array per realisation, aligned with the base
// mesh's vertices. Returns per-vertex RMS over the realisations that DID produce a surface nearby, plus
// how many did not (so "the surface isn't reproduced here at all" is reported, not averaged away).
export function spreadSummary(distances) {
  const n = distances[0]?.length || 0;
  const rms = new Float64Array(n);
  const missing = new Uint16Array(n);
  for (let v = 0; v < n; v++) {
    let s = 0, c = 0, miss = 0;
    for (const arr of distances) {
      const d = arr[v];
      if (Number.isFinite(d)) { s += d * d; c++; } else miss++;
    }
    rms[v] = c ? Math.sqrt(s / c) : Infinity;
    missing[v] = miss;
  }
  const finite = Array.from(rms).filter(Number.isFinite).sort((a, b) => a - b);
  const q = (f) => (finite.length ? finite[Math.min(finite.length - 1, Math.floor(f * finite.length))] : null);
  return { rms, missing, stats: { p10: q(0.1), median: q(0.5), p90: q(0.9), max: finite.length ? finite[finite.length - 1] : null, verticesNotReproduced: Array.from(missing).filter((m) => m > 0).length } };
}

// Colour for a spread value, t = spread / scaleMax clipped to [0, 1]. Pale where the surface barely
// moves, dark where it moves most — lightness falls monotonically (L* ~95 -> ~66 -> ~27), so it reads
// correctly in greyscale and under colour-vision deficiency, and it does NOT reuse the green/amber/red
// of #92's data-support index: that overlay measures the drill pattern, this one measures sensitivity
// to stated input uncertainty, and the two must not be mistaken for each other. Returns [r, g, b] 0-1.
const SPREAD_STOPS = [[255, 247, 204], [240, 138, 36], [94, 26, 82]];
export function spreadColor(t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1)) * 2;
  const i = Math.min(1, Math.floor(x));
  const f = x - i;
  const a = SPREAD_STOPS[i], b = SPREAD_STOPS[i + 1];
  return [0, 1, 2].map((c) => (a[c] + (b[c] - a[c]) * f) / 255);
}
// Vertices where some realisation produced no surface nearby are flagged in neutral grey instead — "not
// reproduced" is a different finding from "moved a lot", and folding it into the ramp would hide it.
export const SPREAD_NOT_REPRODUCED = [0.6, 0.63, 0.66];

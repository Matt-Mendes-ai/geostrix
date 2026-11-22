// TASKS.csv #3962 (P1) — probable grade along a planned hole (Review data\Drill planner\design.md, sections 1.1 and 1.2).
//
// The grade model is kriging read as a Gaussian process, in normal scores:
//   1. the composites' grades -> normal scores (normalScore.js), in the search frame of Grade estimation's trend when it had one;
//   2. a variogram fitted to the normal scores, with Grade estimation's model type, its sill set to 1 (normal scores have variance 1);
//   3. for each planned hole: points every `step` metres down its trace; the union of their nearest composites; ONE simple-kriging
//      system (mean 0) for all of them, giving the joint posterior mean and covariance of the hole's points. Joint, not point by point:
//      neighbouring composites along a hole are correlated, and independent bands would make a 20 m intercept look far more certain;
//   4. R realizations from that posterior (its Cholesky factor times seeded normal draws), each turned back into grades;
//   5. each realization's intercepts by Best intercepts' rules (seriesIntercepts.js), and their P10 / P50 / P90 across realizations,
//      with P(hit): the share of realizations with at least one intercept.
// A point with no composite within the search radius is "beyond the drilling": no prediction there (an unsampled gap), never the
// global mean. The band comes only from the spacing of the holes and the variogram; not from the geology or the variogram being wrong.
import { cholesky, forwardSolve, backSolve, normalStream } from "./gaussian.js";
import { fitNormalScore, backFromTable } from "./normalScore.js";
import { seriesIntercepts } from "./seriesIntercepts.js";
import { experimentalVariogram, fitVariogramModel, variogramModelValue, suggestBetweenHoleLag, suggestLagDistance } from "../variogram.js";
import { trendBasis, trendSearchScales } from "../trend.js";
import { pointOnTrace } from "../desurvey.js";

export const DEFAULTS = { step: 2, realizations: 200, perPoint: 16, maxData: 400, seed: 20261122 };
export const WEAK_FIT_R2 = 0.5; // the Variogram tool's and Grade estimation's own threshold (#1742 / #3273)

// Grade estimation's searchTrend (params) -> the search frame { basis, scales } | null
export function frameOfTrend(searchTrend) {
  if (!searchTrend || !searchTrend.ratios) return null;
  return { basis: trendBasis(searchTrend), scales: trendSearchScales(searchTrend) };
}
// a point in the frame (centred on `c`): along the trend's axes, scaled so the search ellipsoid is a sphere
export function framer(frame, c) {
  if (!frame) return (x, y, z) => [x - c.x, y - c.y, z - c.z];
  const { major: a, semiMajor: b, minor: m } = frame.basis, s = frame.scales;
  return (x, y, z) => { const dx = x - c.x, dy = y - c.y, dz = z - c.z; return [(dx * a.x + dy * a.y + dz * a.z) * s.major, (dx * b.x + dy * b.y + dz * b.z) * s.semiMajor, (dx * m.x + dy * m.y + dz * m.z) * s.minor]; };
}

// points: [{ x, y, z, value, hole_id }] (composites in the grade's unit) -> the model, or { error }
export function fitGradeModel(points, { model = "spherical", searchTrend = null } = {}) {
  const pts = (points || []).filter((p) => [p.x, p.y, p.z, p.value].every(Number.isFinite));
  if (pts.length < 10) return { error: "few", n: pts.length };
  const ns = fitNormalScore(pts.map((p) => p.value));
  if (!ns) return { error: "few", n: pts.length };
  const frame = frameOfTrend(searchTrend);
  const c = { x: 0, y: 0, z: 0 };
  for (const p of pts) { c.x += p.x; c.y += p.y; c.z += p.z; }
  c.x /= pts.length; c.y /= pts.length; c.z /= pts.length;
  const f = framer(frame, c);
  const fp = pts.map((p) => { const [x, y, z] = f(p.x, p.y, p.z); return { x, y, z, value: ns.forward(p.value), hole_id: p.hole_id }; });
  // the lag as Grade estimation's run-time fit takes it (#1027): a quarter of the median spacing between holes, 24 lags
  const between = suggestBetweenHoleLag(fp);
  const lag = (between ? between / 4 : suggestLagDistance(fp)) || 10;
  const ev = experimentalVariogram(fp, { lagDistance: lag, nLags: between ? 24 : 12 });
  const fit = fitVariogramModel(ev.bins, { model });
  if (!fit || !(fit.sill > 0) || !(fit.range > 0)) return { error: "nofit", n: pts.length };
  const nuggetRatio = Math.min(1, Math.max(0, fit.nugget / fit.sill));
  return {
    n: pts.length, holes: new Set(pts.map((p) => p.hole_id)).size,
    centre: c, frame, table: { v: Array.from(ns.table.v), y: Array.from(ns.table.y) }, min: ns.min, max: ns.max,
    vg: { model: fit.model, nugget: nuggetRatio, sill: 1, range: fit.range },
    fit: { rSquared: fit.rSquared, nuggetRatio, range: fit.range, beyondData: !!fit.beyondData, lag, weak: !(fit.rSquared >= WEAK_FIT_R2) },
    data: { x: Float64Array.from(fp, (p) => p.x), y: Float64Array.from(fp, (p) => p.y), z: Float64Array.from(fp, (p) => p.z), ns: Float64Array.from(fp, (p) => p.value) },
    ids: fp.map((p) => String(p.hole_id ?? "")), // each composite's hole, for the program's "Why" (#3962 P2)
  };
}

// a bucket grid over the data (in the frame) for the nearest-composite search
function dataIndex(d, cell) {
  const map = new Map(), n = d.x.length, k = (i, j, l) => `${i},${j},${l}`;
  for (let i = 0; i < n; i++) {
    const key = k(Math.floor(d.x[i] / cell), Math.floor(d.y[i] / cell), Math.floor(d.z[i] / cell));
    (map.get(key) || map.set(key, []).get(key)).push(i);
  }
  return { cell, near(x, y, z, R) { // indices within R, with their squared distances
    const out = [], r = Math.ceil(R / cell), ci = Math.floor(x / cell), cj = Math.floor(y / cell), cl = Math.floor(z / cell), R2 = R * R;
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let l = cl - r; l <= cl + r; l++) {
      const b = map.get(k(i, j, l)); if (!b) continue;
      for (const q of b) { const d2 = (d.x[q] - x) ** 2 + (d.y[q] - y) ** 2 + (d.z[q] - z) ** 2; if (d2 <= R2) out.push([q, d2]); }
    }
    return out;
  } };
}

const cov = (h, vg) => (h <= 1e-9 ? vg.sill : vg.sill - variogramModelValue(h, vg));

// md of each composite top down a trace [{ md, x, y, z }], every `step` metres
export function holeSteps(trace, step) {
  const L = trace?.length ? trace[trace.length - 1].md : 0, out = [];
  for (let a = 0; a + step <= L + 1e-6; a += step) out.push(a);
  return out;
}

// The joint posterior of a hole's composites. -> { tops, inReach: Uint8Array, mean: Float64Array, L (Cholesky of the posterior
// covariance of the points in reach), m (how many in reach), nData, beyondM }
// inside: optional [[fromMd, toMd], ...] (#3962 P2, a target volume): a composite whose centre is outside them is not predicted
export function holePosterior(model, trace, { step = DEFAULTS.step, searchRadius, perPoint = DEFAULTS.perPoint, maxData = DEFAULTS.maxData, inside = null } = {}) {
  const R = searchRadius > 0 ? searchRadius : model.vg.range;
  const f = framer(model.frame, model.centre), d = model.data;
  const idx = model._idx || (model._idx = dataIndex(d, Math.max(1, R / 2)));
  const tops = holeSteps(trace, step);
  const P = tops.map((a) => { const p = pointOnTrace(trace, a + step / 2); return f(p.x, p.y, p.z); });
  const inReach = new Uint8Array(P.length);
  const nearest = new Map(); // data index -> its closest squared distance to the hole
  P.forEach(([x, y, z], i) => {
    if (inside && !inside.some(([a, b]) => tops[i] + step / 2 >= a && tops[i] + step / 2 <= b)) return;
    const near = idx.near(x, y, z, R).sort((a, b) => a[1] - b[1]).slice(0, perPoint);
    if (near.length) inReach[i] = 1;
    for (const [q, d2] of near) if (!(nearest.get(q) <= d2)) nearest.set(q, d2);
  });
  const used = [...nearest].sort((a, b) => a[1] - b[1]).slice(0, maxData).map(([q]) => q);
  const pts = P.filter((_, i) => inReach[i]), m = pts.length, n = used.length;
  const outsideM = inside ? tops.filter((a) => !inside.some(([lo, hi]) => a + step / 2 >= lo && a + step / 2 <= hi)).length * step : 0;
  const beyondM = (P.length - m) * step - outsideM;
  if (!m || !n) return { tops, inReach, mean: new Float64Array(0), L: null, m: 0, nData: 0, beyondM };
  const vg = model.vg;
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    const a = used[i], b = used[j];
    const c = i === j ? vg.sill : cov(Math.hypot(d.x[a] - d.x[b], d.y[a] - d.y[b], d.z[a] - d.z[b]), vg);
    K[i * n + j] = c; K[j * n + i] = c;
  }
  const ck = cholesky(K, n);
  if (!ck) return { tops, inReach, mean: new Float64Array(0), L: null, m: 0, nData: n, beyondM, singular: true };
  // V = L^-1 k (n x m) and alpha = L^-1 z: mean = V' alpha, posterior covariance = C_hh - V'V
  const z = Float64Array.from(used, (q) => d.ns[q]), alpha = forwardSolve(ck.L, n, z);
  const V = new Float64Array(n * m);
  for (let j = 0; j < m; j++) {
    const [x, y, zz] = pts[j], kj = new Float64Array(n);
    for (let i = 0; i < n; i++) { const q = used[i]; kj[i] = cov(Math.hypot(d.x[q] - x, d.y[q] - y, d.z[q] - zz), vg); }
    const v = forwardSolve(ck.L, n, kj);
    for (let i = 0; i < n; i++) V[i * m + j] = v[i];
  }
  const mean = new Float64Array(m);
  for (let j = 0; j < m; j++) { let s = 0; for (let i = 0; i < n; i++) s += V[i * m + j] * alpha[i]; mean[j] = s; }
  const S = new Float64Array(m * m);
  for (let a = 0; a < m; a++) for (let b = a; b < m; b++) {
    let s = a === b ? vg.sill : cov(Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1], pts[a][2] - pts[b][2]), vg);
    for (let i = 0; i < n; i++) s -= V[i * m + a] * V[i * m + b];
    S[a * m + b] = s; S[b * m + a] = s;
  }
  const cs = cholesky(S, m, 1e-9);
  return { tops, inReach, mean, L: cs?.L || null, m, nData: n, beyondM, outsideM, pts, used, variance: Float64Array.from({ length: m }, (_, j) => S[j * m + j]) };
}
export { backSolve }; // for the tests (a kriging-weights check)

const pct = (sorted, p) => { if (!sorted.length) return null; const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo); };
const p3 = (vals) => { const s = Float64Array.from(vals).sort(); return s.length ? [pct(s, 0.1), pct(s, 0.5), pct(s, 0.9)] : null; };

// One hole's prediction: P(hit), the best intercept's P10 / P50 / P90 (length, grade, grade x length, from), the metres above the cut-off,
// and the band down the hole (each composite's P10 / P50 / P90 grade). rules: { cutoff, maxInternalDilution, minLength }.
export function predictHole(model, trace, rules, opts = {}) {
  const step = opts.step || DEFAULTS.step, R = opts.realizations || DEFAULTS.realizations;
  const post = holePosterior(model, trace, { ...opts, step });
  const tops = Float64Array.from(post.tops);
  if (!post.m || !post.L) return { beyond: true, nData: post.nData, beyondM: post.beyondM, lengthM: tops.length * step, step };
  const back = model._back || (model._back = backFromTable(model.table));
  const draw = normalStream((opts.seed ?? DEFAULTS.seed) ^ hashTrace(trace));
  const m = post.m, reachIdx = []; post.inReach.forEach((v, i) => { if (v) reachIdx.push(i); });
  const vals = new Float64Array(tops.length), e = new Float64Array(m), g = new Float64Array(m);
  const perPoint = Array.from({ length: m }, () => new Float64Array(R));
  const hits = [], len = [], grade = [], gt = [], from = [], total = [], hitLen = [];
  for (let r = 0; r < R; r++) {
    for (let j = 0; j < m; j++) e[j] = draw();
    for (let a = 0; a < m; a++) { let s = post.mean[a]; for (let b = 0; b <= a; b++) s += post.L[a * m + b] * e[b]; g[a] = back(s); }
    vals.fill(NaN);
    for (let j = 0; j < m; j++) { vals[reachIdx[j]] = g[j]; perPoint[j][r] = g[j]; }
    const it = seriesIntercepts(tops, step, vals, rules);
    total.push(it.totalM);
    if (it.best) { hits.push(1); len.push(it.best.length); hitLen.push(it.best.length); grade.push(it.best.grade); gt.push(it.best.gt); from.push(it.best.from); }
    else { len.push(0); gt.push(0); }
  }
  const band = { md: [], p10: [], p50: [], p90: [] };
  for (let j = 0; j < m; j++) { const s = perPoint[j].sort(); band.md.push(tops[reachIdx[j]] + step / 2); band.p10.push(pct(s, 0.1)); band.p50.push(pct(s, 0.5)); band.p90.push(pct(s, 0.9)); }
  return {
    beyond: false, step, realizations: R, nData: post.nData, beyondM: post.beyondM, lengthM: tops.length * step,
    pHit: hits.length / R,
    // over every realization (a miss counts as 0 m and 0 grade x length): what the hole is likely to give
    length: p3(len), gt: p3(gt), totalM: p3(total), gtMean: gt.reduce((t, v) => t + v, 0) / R, // the mean: what a rule adds up (#3962 P2)
    varM: post.variance.reduce((t, v) => t + v, 0) * step, // the hole's own kriging variance (normal scores) summed down it: what drilling it would resolve
    // over the realizations that hit: what a hit looks like (grade, where it starts)
    hitLength: p3(hitLen), hitGrade: p3(grade), hitFrom: p3(from),
    band,
  };
}

// a stable 32-bit number from a trace's geometry, so each hole has its own draws and the same hole gets the same draws
function hashTrace(trace) {
  let h = 2166136261;
  for (const p of trace || []) for (const v of [p.x, p.y, p.z]) { h ^= Math.round(v * 100) | 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

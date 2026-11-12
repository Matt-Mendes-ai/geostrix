// TASKS.csv #2756 (split from #2419) — Grade × thickness in plan by ordinary kriging, beside inverse distance: a 2D variogram of each
// variable (GT, thickness) from the holes' own values, fitted (spherical), then point kriging at the plan grid's nodes from the nearest
// holes within the search. The nodes are exactly those inverse distance estimates (lib/accumulation.js planGrid: a hole within the
// search), so the two methods cover the same ground and only the values differ. Loaded on demand by the dialog. Pure.
import { experimentalVariogram, fitVariogramModel, variogramStationarity } from "./variogram.js";
import { planGrid } from "./accumulation.js";

// points [{ x, y, gt, thicknessM, hole_id }]; key "gt" | "thicknessM"; spacing: the typical hole spacing (planSpacing). One point per hole,
// so every pair is between holes; the lag is half the spacing, out to 12 lags.
// -> { fit: { model, nugget, sill, range, rSquared, nuggetRatio } | null, nPairs, n, noSill, rangeBeyond, why }
export function planVariogram(points, key, spacing) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(Number(p[key]))).map((p) => ({ x: p.x, y: p.y, z: 0, value: Number(p[key]), hole_id: p.hole_id }));
  if (P.length < 10) return { fit: null, n: P.length, nPairs: 0, why: "few" };
  const lag = Math.max(1, (spacing > 0 ? spacing : 10) / 2);
  const vg = experimentalVariogram(P, { lagDistance: lag, nLags: 12, holeMode: "all" });
  if (!(vg.variance > 0)) return { fit: null, n: P.length, nPairs: vg.nPairsUsed, why: "flat" }; // every hole the same value: nothing to krige
  const fit = vg.nPairsUsed >= 30 ? fitVariogramModel(vg.bins, { model: "spherical" }) : null;
  if (!fit || !(fit.sill > 0) || !(fit.range > 0)) return { fit: null, n: P.length, nPairs: vg.nPairsUsed, why: "nofit" };
  const st = variogramStationarity(vg, fit);
  return { fit: { model: fit.model, nugget: fit.nugget, sill: fit.sill, range: fit.range, rSquared: fit.rSquared, nuggetRatio: fit.nuggetRatio }, n: P.length, nPairs: vg.nPairsUsed, noSill: st.noSill, rangeBeyond: st.rangeBeyond, why: null };
}

// TASKS.csv #2756 — ordinary kriging at one point in plan, for a spherical variogram, with preallocated buffers: the estimator's okEstimate
// allocated per call and took about 1 s for 7,800 nodes and two variables; this solves the same (n+1) system (covariances divided by the
// sill, Gaussian elimination with partial pivoting) several times faster. -> the value, or NaN when the system is singular
function makeOkSolver(maxN) {
  const m0 = maxN + 1, A = new Float64Array(m0 * m0), rhs = new Float64Array(m0), x = new Float64Array(m0);
  return (xs, ys, vals, n, px, py, vg) => {
    const { nugget, sill, range } = vg, c1 = sill - nugget;
    const k1 = c1 / sill, ir = 1 / range; // Math.hypot and ** were most of the time: plain arithmetic
    const cov = (dx, dy) => { const h = Math.sqrt(dx * dx + dy * dy); if (h <= 0) return 1; if (h >= range) return 0; const u = h * ir; return k1 * (1 - (1.5 * u - 0.5 * u * u * u)); }; // C(h) / sill; C(0) = sill
    const m = n + 1;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) { const c = i === j ? 1 : cov(xs[i] - xs[j], ys[i] - ys[j]); A[i * m + j] = c; A[j * m + i] = c; }
      A[i * m + n] = 1; A[n * m + i] = 1;
      rhs[i] = cov(xs[i] - px, ys[i] - py);
    }
    A[n * m + n] = 0; rhs[n] = 1;
    for (let col = 0; col < m; col++) {
      let piv = col, best = Math.abs(A[col * m + col]);
      for (let r = col + 1; r < m; r++) { const v = Math.abs(A[r * m + col]); if (v > best) { best = v; piv = r; } }
      if (best < 1e-12) return NaN;
      if (piv !== col) { for (let k = 0; k < m; k++) { const t = A[col * m + k]; A[col * m + k] = A[piv * m + k]; A[piv * m + k] = t; } const t = rhs[col]; rhs[col] = rhs[piv]; rhs[piv] = t; }
      const d = A[col * m + col];
      for (let r = col + 1; r < m; r++) { const f = A[r * m + col] / d; if (f === 0) continue; for (let k = col; k < m; k++) A[r * m + k] -= f * A[col * m + k]; rhs[r] -= f * rhs[col]; }
    }
    for (let r = m - 1; r >= 0; r--) { let t = rhs[r]; for (let k = r + 1; k < m; k++) t -= A[r * m + k] * x[k]; x[r] = t / A[r * m + r]; }
    let v = 0;
    for (let i = 0; i < n; i++) v += x[i] * vals[i];
    return v;
  };
}

// planGrid's grid (same nodes), its values replaced by ordinary kriging where the variable has a fitted (spherical) variogram (vgGT / vgTh:
// planVariogram's fit, or null to keep inverse distance for that variable). Negative kriged values (negative weights) are set to 0 and
// counted; a singular system keeps the node's inverse-distance value and is counted.
// -> the grid plus { method: "ok", kriged: { gt, thickness }, clamped, fallback, maxSamples }
export function planGridOK(points, { cell, radius, pad = 0, maxNodes = 250000, maxSamples = 12, vgGT = null, vgTh = null }) {
  const g = planGrid(points, { cell, radius, pad, maxNodes });
  if (!g) return null;
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.gt));
  const b = radius, key = (i, j) => i * 100003 + j, buckets = new Map();
  for (const p of P) { const k = key(Math.floor((p.x - g.x0) / b), Math.floor((p.y - g.y0) / b)); (buckets.get(k) || buckets.set(k, []).get(k)).push(p); }
  const gt = Float64Array.from(g.gt), th = Float64Array.from(g.thickness);
  const solve = makeOkSolver(maxSamples);
  const xs = new Float64Array(maxSamples), ys = new Float64Array(maxSamples), vG = new Float64Array(maxSamples), vT = new Float64Array(maxSamples);
  let clamped = 0, fallback = 0;
  // the nearest maxSamples holes, kept sorted by insertion in fixed buffers (no per-node arrays: they were most of the time)
  const kd = new Float64Array(maxSamples), kp = new Array(maxSamples), r2 = radius * radius;
  const neigh = []; // the 3 x 3 buckets' lists around a node
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const idx = i + g.nx * j;
    if (!Number.isFinite(g.gt[idx])) continue; // not estimated by inverse distance either: no hole within the search
    const x = g.x0 + i * g.cell, y = g.y0 + j * g.cell, bi = Math.floor((x - g.x0) / b), bj = Math.floor((y - g.y0) / b);
    neigh.length = 0;
    for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) { const l = buckets.get(key(bi + a, bj + d)); if (l) neigh.push(l); }
    let n = 0, onHole = false;
    for (const l of neigh) for (const p of l) {
      const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d2 > r2 || (n === maxSamples && d2 >= kd[n - 1])) continue;
      if (d2 < 1e-12) onHole = true;
      let k = n < maxSamples ? n++ : n - 1;
      while (k > 0 && kd[k - 1] > d2) { kd[k] = kd[k - 1]; kp[k] = kp[k - 1]; k--; }
      kd[k] = d2; kp[k] = p;
    }
    if (onHole) continue; // on a hole: its own value (inverse distance's exact match)
    for (let k = 0; k < n; k++) { const p = kp[k]; xs[k] = p.x; ys[k] = p.y; vG[k] = p.gt; vT[k] = Number(p.thicknessM) || 0; }
    for (let v = 0; v < 2; v++) {
      const vg = v ? vgTh : vgGT;
      if (!vg) continue;
      let val = solve(xs, ys, v ? vT : vG, n, x, y, vg);
      if (!Number.isFinite(val)) { fallback++; continue; }
      if (val < 0) { val = 0; clamped++; }
      (v ? th : gt)[idx] = val;
    }
  }
  return { ...g, gt, thickness: th, method: "ok", kriged: { gt: !!vgGT, thickness: !!vgTh }, clamped, fallback, maxSamples };
}

// TASKS.csv #1999 — a robust multivariate anomaly score: the Mahalanobis distance of each sample from the bulk of the data, with the centre
// and spread estimated by the Minimum Covariance Determinant (MCD), on log-ratio (ilr) coordinates of a chosen set of elements, after
// Filzmoser, Garrett & Reimann (2005, Computers & Geosciences 31, 579-587) and Filzmoser, Hron & Reimann (2009). Geochemical data are
// compositions: their raw values are closed (they sum towards a constant) and skewed, so the distance is taken on isometric log-ratio
// coordinates (any orthonormal basis gives the same distance; pivot coordinates are used here). The MCD finds the h = 0.75 n samples whose
// covariance has the smallest determinant, so up to a quarter of the samples can be anomalous without pulling the centre or the spread
// towards themselves, as they would with the plain mean and covariance. The distance is a RANKING of how unusual a sample's whole
// composition is, not a probability of mineralization; the 97.5 % chi-square quantile is the customary flag line.
// FAST-MCD (Rousseeuw & Van Driessen 1999): random (p + 1)-subsets, concentration steps (C-steps), the best few iterated to convergence,
// a subsample stage for large n, the consistency factor, and one reweighting step. Seeded, so the same data give the same scores. Pure.

// ---- special functions -------------------------------------------------------------------------------
function lnGamma(z) { // Lanczos, g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
// the regularized lower incomplete gamma P(a, x) (series below a + 1, continued fraction above)
export function regGammaP(a, x) {
  if (!(x > 0)) return 0;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - gln) * h);
}
export const chi2Cdf = (x, df) => regGammaP(df / 2, x / 2);
// the q-quantile of chi-square with df degrees of freedom (bisection on the CDF)
export function chi2Quantile(q, df) {
  let lo = 0, hi = Math.max(10, df * 4);
  while (chi2Cdf(hi, df) < q) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (chi2Cdf(m, df) < q) lo = m; else hi = m; if (hi - lo < 1e-12 * Math.max(1, hi)) break; }
  return (lo + hi) / 2;
}

// ---- log ratios ---------------------------------------------------------------------------------------
// pivot (ilr) coordinates of one composition of D positive parts -> D - 1 numbers
export function pivotIlr(x) {
  const D = x.length, l = x.map(Math.log), out = new Array(D - 1);
  let tail = 0;
  for (let i = D - 1; i >= 1; i--) tail += l[i];
  for (let i = 0; i < D - 1; i++) {
    const m = D - i - 1; // parts after i
    out[i] = Math.sqrt(m / (m + 1)) * (l[i] - tail / m);
    tail -= l[i + 1];
  }
  return out;
}

// ---- linear algebra on p x p (row-major Float64Array) --------------------------------------------------
function meanCov(X, idx, p, w = null) {
  const mu = new Float64Array(p), S = new Float64Array(p * p);
  let sw = 0;
  for (const i of idx) { const wi = w ? w[i] : 1; sw += wi; const r = X[i]; for (let j = 0; j < p; j++) mu[j] += wi * r[j]; }
  for (let j = 0; j < p; j++) mu[j] /= sw;
  const d = new Float64Array(p);
  for (const i of idx) {
    const wi = w ? w[i] : 1, r = X[i];
    for (let j = 0; j < p; j++) d[j] = r[j] - mu[j];
    for (let j = 0; j < p; j++) { const dj = wi * d[j]; for (let k = 0; k <= j; k++) S[j * p + k] += dj * d[k]; }
  }
  const den = Math.max(1, sw - 1);
  for (let j = 0; j < p; j++) for (let k = 0; k <= j; k++) { const v = S[j * p + k] / den; S[j * p + k] = v; S[k * p + j] = v; }
  return { mu, S };
}
// lower Cholesky factor, or null when not positive definite
function cholesky(S, p) {
  const L = new Float64Array(p * p);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      let s = S[i * p + j];
      for (let k = 0; k < j; k++) s -= L[i * p + k] * L[j * p + k];
      if (i === j) { if (!(s > 1e-12 * Math.max(1, Math.abs(S[i * p + i])))) return null; L[i * p + i] = Math.sqrt(s); }
      else L[i * p + j] = s / L[j * p + j];
    }
  }
  return L;
}
const logDet = (L, p) => { let s = 0; for (let i = 0; i < p; i++) s += 2 * Math.log(L[i * p + i]); return s; };
// squared Mahalanobis distances of every row to (mu, L L')
function mahal2(X, mu, L, p, out) {
  const y = new Float64Array(p);
  for (let r = 0; r < X.length; r++) {
    const x = X[r];
    let s = 0;
    for (let i = 0; i < p; i++) { let v = x[i] - mu[i]; for (let k = 0; k < i; k++) v -= L[i * p + k] * y[k]; y[i] = v / L[i * p + i]; s += y[i] * y[i]; }
    out[r] = s;
  }
  return out;
}
const smallest = (d, h) => Array.from(d.keys()).sort((a, b) => d[a] - d[b]).slice(0, h);

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
function sample(rand, n, k) { // k distinct indices of 0..n-1
  const s = new Set();
  while (s.size < Math.min(k, n)) s.add(Math.floor(rand() * n));
  return [...s];
}

// C-steps from an h-subset until the determinant stops falling (or maxIt). -> { idx, mu, S, L, ld } or null
function concentrate(X, p, h, idx, maxIt) {
  let fit = null, ld = Infinity;
  const d = new Float64Array(X.length);
  for (let it = 0; it < maxIt; it++) {
    const { mu, S } = meanCov(X, idx, p), L = cholesky(S, p);
    if (!L) return fit;
    const l = logDet(L, p);
    if (fit && l >= ld - 1e-10) break;
    fit = { idx, mu, S, L, ld: l }; ld = l;
    idx = smallest(mahal2(X, mu, L, p, d), h);
  }
  return fit;
}

// FAST-MCD on rows X (arrays of p numbers). o: { alpha = 0.75, starts = 50, seed = 1, subsample = 1500 }.
// -> { d2 (Float64Array, squared robust distances), mu, S, h, p, n } or throws when the covariance is singular
export function fastMcd(X, { alpha = 0.75, starts = 50, seed = 1, subsample = 1500 } = {}) {
  const n = X.length, p = X[0]?.length || 0;
  if (p < 1) throw new Error("MCD needs at least one coordinate.");
  if (n < 2 * p + 2) throw new Error(`MCD needs more samples than ${2 * p + 1} for ${p} coordinates (has ${n}).`);
  const rand = mulberry32(seed);
  const h = Math.max(p + 1, Math.floor(alpha * n));
  // the starts on a subsample when there are many rows (the C-steps on all rows are the cost)
  const subIdx = n > subsample ? sample(rand, n, subsample) : Array.from({ length: n }, (_, i) => i);
  const Xs = subIdx.map((i) => X[i]), hs = Math.max(p + 1, Math.floor(alpha * Xs.length));
  const cands = [];
  for (let s = 0; s < starts; s++) {
    let idx = sample(rand, Xs.length, p + 1);
    let mc = meanCov(Xs, idx, p), L = cholesky(mc.S, p);
    while (!L && idx.length < hs) { idx = [...new Set([...idx, ...sample(rand, Xs.length, 1)])]; mc = meanCov(Xs, idx, p); L = cholesky(mc.S, p); }
    if (!L) continue;
    const d = mahal2(Xs, mc.mu, L, p, new Float64Array(Xs.length));
    const f = concentrate(Xs, p, hs, smallest(d, hs), 2);
    if (f) cands.push(f);
  }
  if (!cands.length) throw new Error("The covariance of these coordinates is singular: an element with too many identical values (below detection, a fill value) or two elements that move together exactly.");
  cands.sort((a, b) => a.ld - b.ld);
  let best = null;
  for (const c of cands.slice(0, 10)) { const f = concentrate(Xs, p, hs, c.idx, 100); if (f && (!best || f.ld < best.ld)) best = f; }
  // on all rows, from the subsample's best
  if (Xs !== X && n > subsample) {
    const d = mahal2(X, best.mu, best.L, p, new Float64Array(n));
    best = concentrate(X, p, h, smallest(d, h), 100) || best;
  }
  // consistency factor (the h-subset's covariance is too small for normal data) and one reweighting step
  const a1 = h / n, c1 = a1 / chi2Cdf(chi2Quantile(a1, p), p + 2);
  const S1 = best.S.map((v) => v * c1), L1 = cholesky(S1, p);
  const d2 = mahal2(X, best.mu, L1, p, new Float64Array(n));
  const cut = chi2Quantile(0.975, p), keep = [];
  for (let i = 0; i < n; i++) if (d2[i] <= cut) keep.push(i);
  if (keep.length > p + 1) {
    const { mu, S } = meanCov(X, keep, p), c2 = 0.975 / chi2Cdf(cut, p + 2), S2 = S.map((v) => v * c2), L2 = cholesky(S2, p);
    if (L2) return { d2: mahal2(X, mu, L2, p, new Float64Array(n)), mu, S: S2, h, p, n };
  }
  return { d2, mu: best.mu, S: S1, h, p, n };
}

// The score for a set of samples: rows = [{ values: { Cu: 12, ... } }], symbols = the elements (in one unit each; ppm / % mixes are fine,
// the log ratios cancel a constant factor per element). A sample missing any of them, or with a value <= 0, gets no score.
// -> { scores: (number|null)[], cutoff, p, used, flagged, h } (score = robust distance, cutoff = sqrt of chi-square 97.5 %, p = D - 1)
export function mcdAnomalyScores(rows, symbols, opts = {}) {
  const D = symbols.length;
  if (D < 3) throw new Error("Choose at least three elements: the score is taken on their log ratios.");
  return mcdFromPacked(mcdPack(rows, symbols), (rows || []).length, D, opts);
}
// TASKS.csv #3030 (split from #1999) — the score in a Web Worker for 10^5 samples (about 0.1 s per 1,000 on the main thread): the chosen
// values packed row by row into one Float64Array (NaN for no number), which a worker takes without copying each sample object, and the
// fit on that array, the same code on either side. -> Float64Array(n * D)
export function mcdPack(rows, symbols) {
  const n = (rows || []).length, D = symbols.length, out = new Float64Array(n * D);
  for (let i = 0; i < n; i++) { const v = rows[i]?.values; for (let j = 0; j < D; j++) { const x = Number(v?.[symbols[j]]); out[i * D + j] = Number.isFinite(x) ? x : NaN; } }
  return out;
}
export function mcdFromPacked(packed, n, D, opts = {}) {
  if (D < 3) throw new Error("Choose at least three elements: the score is taken on their log ratios.");
  const idx = [], X = [];
  for (let i = 0; i < n; i++) {
    const x = Array.from(packed.subarray(i * D, i * D + D));
    if (x.every((v) => Number.isFinite(v) && v > 0)) { idx.push(i); X.push(pivotIlr(x)); }
  }
  const fit = fastMcd(X, opts);
  const scores = new Array(n).fill(null), cutoff = Math.sqrt(chi2Quantile(0.975, fit.p));
  let flagged = 0;
  idx.forEach((ri, k) => { const v = Math.sqrt(fit.d2[k]); scores[ri] = v; if (v > cutoff) flagged++; });
  return { scores, cutoff, p: fit.p, used: idx.length, flagged, h: fit.h };
}

// The elements a score starts from, read from the data, not from a deposit type: assayed (not calculated) elements with a positive value on
// at least 90 % of the rows and no more than a quarter of them below detection (a column of half-limit substitutes is near-constant in log
// ratios and makes the covariance singular), most complete first, at most `max` of them and fewer than n / 5. -> [symbol]
export function defaultMcdElements(rows, elements, { max = 12, minShare = 0.9, maxBdl = 0.25 } = {}) {
  const n = (rows || []).length;
  if (!n) return [];
  const isBdl = (r, s) => (Array.isArray(r.bdl) ? r.bdl.includes(s) : r.qualifiers?.[s] === "<");
  const stats = (elements || []).filter((e) => !e.calculated).map((e) => {
    let has = 0, bdl = 0;
    for (const r of rows) { const v = Number(r?.values?.[e.symbol]); if (Number.isFinite(v) && v > 0) { has++; if (isBdl(r, e.symbol)) bdl++; } }
    return { symbol: e.symbol, share: has / n, bdl: has ? bdl / has : 1 };
  }).filter((s) => s.share >= minShare && s.bdl <= maxBdl).sort((a, b) => b.share - a.share || a.bdl - b.bdl);
  return stats.slice(0, Math.max(0, Math.min(max, Math.floor(n / 5)))).map((s) => s.symbol);
}

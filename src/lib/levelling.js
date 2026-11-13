// TASKS.csv #1001 — levelling one survey's surface samples to another (docs/ideas/soils-stream-sediments.md 3.2, 7.4): old
// surveys, other labs and public data differ in digestion and detection, and without levelling the map shows the survey
// boundaries. Darnley et al. (1995, IGCP 259) hold that batches should be tied through re-sampled sites or shared reference
// materials, and that statistical levelling without them can erase or create anomalies. So:
//   - TIE SAMPLES come first: sites both surveys sampled (same medium, within a chosen distance). The level is one factor,
//     the median target / survey ratio of the pairs, with the spread of the ratios reported.
//   - QUANTILE MATCHING is the fallback, always labelled as statistical: it ASSUMES both surveys sampled the same population.
//     The shift is matched between the 5th and 95th percentiles (on log values) and held constant beyond them, so a real
//     anomaly keeps its height over background: mapping the top of one survey onto the top of the other would cap it.
// Nothing overwrites the source values: the result is a new element column (Cu -> Cu_lev) holding the reference survey's
// values as they are and the levelled survey's adjusted ones, with a basis column saying how each value got there. Below-
// detection and not-detected results take no part in a fit (their values are substitutes). Pure: no React, no DOM.
import { PROJECT_SOURCE } from "./thresholds.js";
import { median, quantileSorted, arrMax } from "./arrayStats.js"; // arrMax: #2902

export const LEVEL_SUFFIX = "_lev";
export const MIN_TIES = 5;   // fewer pairs than this is an anecdote, not a level
export const MIN_STAT = 30;  // per survey, for a quantile match
const P_LOW = 0.05, P_HIGH = 0.95, N_KNOTS = 19;

export const levelledSymbol = (symbol) => `${symbol}${LEVEL_SUFFIX}`;
export const basisColumn = (symbol) => `${levelledSymbol(symbol)}_basis`;

// A sample's survey under a grouping column: "source" (public imports carry it; the rest are project samples), or any other
// column (year, lab, batch). "" = not in any survey.
export function surveyKey(s, column = "source") {
  const v = s.attrs?.[column];
  if (v != null && String(v).trim() !== "") return String(v);
  return column === "source" ? PROJECT_SOURCE : "";
}
export function surveysOf(samples, column = "source") {
  const n = new Map();
  for (const s of samples) { const k = surveyKey(s, column); if (k) n.set(k, (n.get(k) || 0) + 1); }
  return [...n.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

const measured = (s, symbol) => {
  const v = s.values?.[symbol];
  return Number.isFinite(v) && v > 0 && !s.bdl?.includes(symbol) && !s.nd?.includes(symbol) ? v : null;
};

// Sites both surveys sampled: each survey sample with its nearest reference sample within radiusM, closest pairs first, each
// sample used once. -> [{ a, b, d }] (a: reference, b: survey)
export function tiePairs(reference, survey, symbol, radiusM) {
  const cell = radiusM > 0 ? radiusM : 1, key = (x, y) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  const grid = new Map();
  reference.forEach((a) => { if (measured(a, symbol) == null || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return; const k = key(a.x, a.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(a); });
  const candidates = [];
  for (const b of survey) {
    if (measured(b, symbol) == null || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const ci = Math.floor(b.x / cell), cj = Math.floor(b.y / cell);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      for (const a of grid.get(`${i}:${j}`) || []) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d <= radiusM) candidates.push({ a, b, d }); }
    }
  }
  candidates.sort((p, q) => p.d - q.d);
  const usedA = new Set(), usedB = new Set(), pairs = [];
  for (const p of candidates) { if (usedA.has(p.a) || usedB.has(p.b)) continue; usedA.add(p.a); usedB.add(p.b); pairs.push(p); }
  return pairs;
}

// The shift (log10 reference - log10 survey) at N_KNOTS quantiles from 5 % to 95 %, knots with the same survey value merged
function quantileKnots(refValues, surveyValues) {
  const lr = refValues.map(Math.log10).sort((a, b) => a - b), ls = surveyValues.map(Math.log10).sort((a, b) => a - b);
  const knots = [];
  for (let i = 0; i < N_KNOTS; i++) {
    const p = P_LOW + ((P_HIGH - P_LOW) * i) / (N_KNOTS - 1);
    const at = quantileSorted(ls, p), shift = quantileSorted(lr, p) - at;
    if (knots.length && at <= knots[knots.length - 1].at) knots[knots.length - 1].shift = shift; else knots.push({ at, shift });
  }
  return knots;
}
function shiftAt(knots, lv) {
  if (lv <= knots[0].at) return knots[0].shift;
  const last = knots[knots.length - 1];
  if (lv >= last.at) return last.shift;
  for (let i = 1; i < knots.length; i++) {
    if (lv <= knots[i].at) { const f = (lv - knots[i - 1].at) / (knots[i].at - knots[i - 1].at); return knots[i - 1].shift + f * (knots[i].shift - knots[i - 1].shift); }
  }
  return last.shift;
}

// TASKS.csv #2000 — regression levelling on the tie sites, after Main & Champion (2022, J. Geochem. Explor. 240, 107028): log10 reference
// = a + b log10 survey, fitted by Huber's M-estimator (iteratively reweighted least squares, k = 1.345 sigma, sigma from the residuals'
// MAD / 0.6745, re-estimated each pass), so a tie that disagrees (a nugget, a mislabelled site) weighs less instead of tilting the line.
// Unlike the one-factor tie level, the slope can differ from 1: the level then depends on the value, which is what a digestion or a
// detection difference does. -> { a, b, sigma, n, downweighted, iterations } or null (under MIN_TIES pairs, or no spread in x)
export function huberLine(xs, ys, { k = 1.345, maxIter = 50, tol = 1e-9 } = {}) {
  const n = Math.min(xs?.length || 0, ys?.length || 0);
  if (n < MIN_TIES) return null;
  let w = new Array(n).fill(1), a = 0, b = 1, sigma = 0, it = 0;
  const wls = () => {
    let sw = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sw += w[i]; sx += w[i] * xs[i]; sy += w[i] * ys[i]; }
    const mx = sx / sw, my = sy / sw;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx; sxx += w[i] * dx * dx; sxy += w[i] * dx * (ys[i] - my); }
    if (!(sxx > 0)) return false;
    b = sxy / sxx; a = my - b * mx; return true;
  };
  if (!wls()) return null;
  for (it = 1; it <= maxIter; it++) {
    const r = xs.slice(0, n).map((x, i) => ys[i] - (a + b * x));
    const mad = median(r.map((v) => Math.abs(v - median(r))));
    sigma = mad / 0.6745;
    if (!(sigma > 0)) break; // the ties lie on a line: least squares is the answer
    const c = k * sigma;
    w = r.map((v) => (Math.abs(v) <= c ? 1 : c / Math.abs(v)));
    const a0 = a, b0 = b;
    if (!wls()) return null;
    if (Math.abs(a - a0) < tol && Math.abs(b - b0) < tol) break;
  }
  return { a, b, sigma, n, downweighted: w.filter((x) => x < 1).length, iterations: it };
}

// What each method would do. o: { symbol, medium, column, reference, survey, radiusM }.
// -> { nReference, nSurvey, ties: { n, ok, factor, low, high, pairs } | null, stats: { ok, knots, need } }
export function fitLevelling(samples, { symbol, medium, column = "source", reference, survey, radiusM = 25 }) {
  const inMedium = samples.filter((s) => s.medium === medium);
  const ref = inMedium.filter((s) => surveyKey(s, column) === reference), sur = inMedium.filter((s) => surveyKey(s, column) === survey);
  const refV = ref.map((s) => measured(s, symbol)).filter((v) => v != null), surV = sur.map((s) => measured(s, symbol)).filter((v) => v != null);
  const pairs = tiePairs(ref, sur, symbol, radiusM);
  let ties = null;
  if (pairs.length) {
    const ratios = pairs.map((p) => measured(p.a, symbol) / measured(p.b, symbol)).sort((a, b) => a - b);
    ties = { n: pairs.length, ok: pairs.length >= MIN_TIES, factor: median(ratios), low: quantileSorted(ratios, 0.16), high: quantileSorted(ratios, 0.84), pairs };
    // #2000 — the Huber line through the same pairs (log10 survey -> log10 reference)
    ties.huber = ties.ok ? huberLine(pairs.map((p) => Math.log10(measured(p.b, symbol))), pairs.map((p) => Math.log10(measured(p.a, symbol)))) : null;
  }
  const statOk = refV.length >= MIN_STAT && surV.length >= MIN_STAT;
  return { nReference: refV.length, nSurvey: surV.length, ties, stats: { ok: statOk, need: MIN_STAT, knots: statOk ? quantileKnots(refV, surV) : null }, medianReference: refV.length ? median(refV) : null, medianSurvey: surV.length ? median(surV) : null };
}

// TASKS.csv #2981 (split from #2000) — the tie scatter Main & Champion (2022) read before trusting a level: log10 survey (x) against log10
// reference (y) at each tie site, with the 1:1 line, the median-ratio line (y = x + log10 factor) and the Huber line (y = a + b x); a tie
// the Huber fit weighs down (|residual| > k sigma) is marked. -> { points: [{ x, y, down }], lo, hi, median, huber } or null (no ties)
export function tieScatter(fit, symbol, { k = 1.345 } = {}) {
  const pairs = fit?.ties?.pairs || [];
  if (!pairs.length) return null;
  const h = fit.ties.huber, c = h && h.sigma > 0 ? k * h.sigma : Infinity;
  const points = [];
  for (const p of pairs) {
    const x = Math.log10(measured(p.b, symbol)), y = Math.log10(measured(p.a, symbol));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x, y, down: !!h && Math.abs(y - (h.a + h.b * x)) > c });
  }
  if (!points.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const q of points) { lo = Math.min(lo, q.x, q.y); hi = Math.max(hi, q.x, q.y); }
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.05;
  return { points, lo: lo - pad, hi: hi + pad, median: fit.ties.factor > 0 ? Math.log10(fit.ties.factor) : null, huber: h ? { a: h.a, b: h.b } : null };
}

// fit + method ("ties" | "huber" | "quantile") -> value => levelled value
export function leveller(fit, method) {
  if (method === "ties") { if (!fit.ties?.ok) return null; const f = fit.ties.factor; return (v) => v * f; }
  if (method === "huber") { const h = fit.ties?.huber; if (!h) return null; return (v) => (v > 0 ? 10 ** (h.a + h.b * Math.log10(v)) : v); } // #2000
  if (method === "quantile") { if (!fit.stats.ok) return null; const k = fit.stats.knots; return (v) => (v > 0 ? 10 ** (Math.log10(v) + shiftAt(k, Math.log10(v))) : v); }
  return null;
}

// The survey's median and maximum before and after, beside the reference's: what the panel shows before anything is written
export function levellingPreview(samples, fit, method, { symbol, medium, column = "source", reference, survey }) {
  const fn = leveller(fit, method);
  if (!fn) return null;
  const vals = (key) => samples.filter((s) => s.medium === medium && surveyKey(s, column) === key).map((s) => measured(s, symbol)).filter((v) => v != null);
  const r = vals(reference), b = vals(survey), a = b.map(fn);
  return { reference: { median: median(r), max: arrMax(r) }, before: { median: median(b), max: arrMax(b) }, after: { median: median(a), max: arrMax(a) } }; // #2902 — a survey can hold 10^5 samples: no spread
}

// Writes the column: -> { samples, element, written: { reference, levelled } }. Only this medium's values of the levelled
// column are replaced (run once per medium); the source column, other media and other surveys are left alone.
export function writeLevelled(samples, elements, fit, method, { symbol, medium, column = "source", reference, survey, radiusM = 25 }) {
  const fn = leveller(fit, method);
  if (!fn) throw new Error(`no ${method} level`);
  const sym = levelledSymbol(symbol), basisCol = basisColumn(symbol);
  const basis = method === "ties"
    ? `levelled to ${reference}: x${+fit.ties.factor.toPrecision(4)}, median ratio of ${fit.ties.n} tie sites within ${radiusM} m`
    : method === "huber" // #2000
      ? `levelled to ${reference}: log10 ref = ${+fit.ties.huber.a.toPrecision(4)} + ${+fit.ties.huber.b.toPrecision(4)} x log10 value, Huber regression (k = 1.345) on ${fit.ties.n} tie sites within ${radiusM} m (Main & Champion 2022)`
      : `levelled to ${reference}: STATISTICAL quantile match, no tie samples; assumes both surveys sampled the same population`;
  const written = { reference: 0, levelled: 0 };
  const out = samples.map((s) => {
    if (s.medium !== medium) return s;
    const values = { ...(s.values || {}) }, attrs = { ...(s.attrs || {}) };
    let bdl = (s.bdl || []).filter((x) => x !== sym), nd = (s.nd || []).filter((x) => x !== sym);
    delete values[sym]; delete attrs[basisCol];
    const key = surveyKey(s, column), v = s.values?.[symbol];
    if ((key === reference || key === survey) && Number.isFinite(v)) {
      if (key === reference) { values[sym] = v; attrs[basisCol] = "reference survey: value as reported"; written.reference++; }
      else { values[sym] = fn(v); attrs[basisCol] = basis; written.levelled++; }
      if (s.bdl?.includes(symbol)) bdl = [...bdl, sym];
      if (s.nd?.includes(symbol)) nd = [...nd, sym];
    }
    const next = { ...s, values, attrs };
    if (bdl.length || s.bdl) next.bdl = bdl;
    if (nd.length || s.nd) next.nd = nd;
    return next;
  });
  const source = elements.find((e) => e.symbol === symbol);
  const element = { ...(source || {}), symbol: sym, unit: source?.unit || "ppm" };
  return { samples: out, elements: elements.some((e) => e.symbol === sym) ? elements : [...elements, element], element, written };
}

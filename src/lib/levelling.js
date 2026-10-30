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
import { median, quantileSorted } from "./arrayStats.js";

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
  }
  const statOk = refV.length >= MIN_STAT && surV.length >= MIN_STAT;
  return { nReference: refV.length, nSurvey: surV.length, ties, stats: { ok: statOk, need: MIN_STAT, knots: statOk ? quantileKnots(refV, surV) : null }, medianReference: refV.length ? median(refV) : null, medianSurvey: surV.length ? median(surV) : null };
}

// fit + method ("ties" | "quantile") -> value => levelled value
export function leveller(fit, method) {
  if (method === "ties") { if (!fit.ties?.ok) return null; const f = fit.ties.factor; return (v) => v * f; }
  if (method === "quantile") { if (!fit.stats.ok) return null; const k = fit.stats.knots; return (v) => (v > 0 ? 10 ** (Math.log10(v) + shiftAt(k, Math.log10(v))) : v); }
  return null;
}

// The survey's median and maximum before and after, beside the reference's: what the panel shows before anything is written
export function levellingPreview(samples, fit, method, { symbol, medium, column = "source", reference, survey }) {
  const fn = leveller(fit, method);
  if (!fn) return null;
  const vals = (key) => samples.filter((s) => s.medium === medium && surveyKey(s, column) === key).map((s) => measured(s, symbol)).filter((v) => v != null);
  const r = vals(reference), b = vals(survey), a = b.map(fn);
  return { reference: { median: median(r), max: Math.max(...r) }, before: { median: median(b), max: Math.max(...b) }, after: { median: median(a), max: Math.max(...a) } };
}

// Writes the column: -> { samples, element, written: { reference, levelled } }. Only this medium's values of the levelled
// column are replaced (run once per medium); the source column, other media and other surveys are left alone.
export function writeLevelled(samples, elements, fit, method, { symbol, medium, column = "source", reference, survey, radiusM = 25 }) {
  const fn = leveller(fit, method);
  if (!fn) throw new Error(`no ${method} level`);
  const sym = levelledSymbol(symbol), basisCol = basisColumn(symbol);
  const basis = method === "ties"
    ? `levelled to ${reference}: x${+fit.ties.factor.toPrecision(4)}, median ratio of ${fit.ties.n} tie sites within ${radiusM} m`
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

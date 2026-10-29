// TASKS.csv #841 — anomaly thresholds for soil / stream-sediment geochemistry, judged within populations (groups).
// Matt: "start on 841" (from #839, docs/ideas/soils-stream-sediments.md 4.1 + 3.1).
//
// The threshold IS the anomaly map, and the rules disagree, so the candidates are computed side by side with their
// assumptions, and the geologist picks one (stored with the project, see store `geochemThresholds`):
//   * percentiles 90 / 95 / 98 (no distribution assumed; they flag a fixed share of samples whether or not any
//     are anomalous);
//   * mean + 2 SD of log10 values (Hawkes & Webb 1962, the historical rule; assumes ONE log-normal population,
//     which soil data rarely are);
//   * median + 2 MAD of log10 values (Reimann, Filzmoser & Garrett 2005, Science of the Total Environment 346, 1-16;
//     robust to the outliers it is looking for);
//   * Tukey upper fence on log10 values, Q3 + 1.5 IQR (Tukey 1977; recommended with the MAD rule by Reimann et al.);
//   * a probability-plot break (Lepeltier 1969; Sinclair 1976, Applications of Probability Graphs in Mineral
//     Exploration): sorted log values against normal scores, the bend between two straight segments, found by the
//     least-squares best two-segment fit - an automatic SUGGESTION to check on the plot, not a partition into
//     populations;
// NOT offered: the concentration-number break (Hassanpour & Afzal 2013, the point form of Cheng, Agterberg &
// Ballantyne's 1994 concentration-area method). Tried and dropped: on its log-log plot one log-normal population
// curves all the way up, so two lines always beat one - simulated (40 seeds each, as below) the residual ratio was
// 0.05-0.31 with no anomalous samples and 0.08-0.36 with 5 % of them, so a break it found said nothing about a
// second population. Concentration-area on a gridded map may come with #843.
// Below-detection values come in already substituted (half the detection limit at import, geochem.js) and are counted
// so the panel can say how much of an element is censored (the statistics of a heavily censored element are mostly
// about the detection limit - Helsel 2012).
//
// Robust z-score of a sample within its group: (log10 x - median) / (1.4826 MAD), both of the group's log10 values.
import { pointInRings } from "./mapLayers.js";
import { quantileSorted, median } from "./arrayStats.js"; // TASKS.csv #1114

const LN10 = Math.log(10);
const log10 = (v) => Math.log(v) / LN10;
const sortNum = (a) => a.slice().sort((x, y) => x - y);
// Hyndman & Fan type 7 quantile and the median: arrayStats.js since TASKS.csv #1114, re-exported for this file's importers
export { quantileSorted, median };
// Median absolute deviation, scaled by 1.4826 to estimate the SD of a normal distribution
export function madScaled(values, med = median(values)) { return 1.4826 * median(values.map((v) => Math.abs(v - med))); }

// Inverse standard normal (Acklam's rational approximation, relative error < 1.2e-9)
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425, hi = 1 - lo;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > hi) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Best split of (xs[i], ys[i]) (xs ascending) into two independently fitted straight lines, minimum total squared
// residual, each side with at least `minSide` points: { k (first index of the upper segment), sse, slopes } or null.
export function twoSegmentBreak(xs, ys, minSide = 8) {
  const n = xs.length;
  if (n < 2 * minSide) return null;
  const pre = [[0, 0, 0, 0, 0]]; // cumulative n-less sums: x, y, xx, xy, yy
  for (let i = 0; i < n; i++) { const p = pre[i]; pre.push([p[0] + xs[i], p[1] + ys[i], p[2] + xs[i] * xs[i], p[3] + xs[i] * ys[i], p[4] + ys[i] * ys[i]]); }
  const fit = (a, b) => { // points a..b-1
    const m = b - a, s = pre[b].map((v, i) => v - pre[a][i]);
    const sxx = s[2] - (s[0] * s[0]) / m, sxy = s[3] - (s[0] * s[1]) / m, syy = s[4] - (s[1] * s[1]) / m;
    const slope = sxx > 0 ? sxy / sxx : 0;
    return { sse: Math.max(0, syy - slope * sxy), slope };
  };
  let best = null;
  for (let k = minSide; k <= n - minSide; k++) {
    const l = fit(0, k), r = fit(k, n), sse = l.sse + r.sse;
    if (!best || sse < best.sse) best = { k, sse, slopes: [l.slope, r.slope] };
  }
  return best && { ...best, sse1: fit(0, n).sse };
}

// Summary of one population: n, censored count, linear quantiles, log10 location / spread
export function populationSummary(values, censored = 0) {
  const pos = values.filter((v) => Number.isFinite(v) && v > 0);
  const s = sortNum(pos), L = s.map(log10);
  if (!s.length) return null;
  const meanL = L.reduce((a, v) => a + v, 0) / L.length;
  const sdL = L.length > 1 ? Math.sqrt(L.reduce((a, v) => a + (v - meanL) ** 2, 0) / (L.length - 1)) : 0;
  const medL = quantileSorted(L, 0.5);
  return {
    n: s.length, censored, censoredPct: s.length ? (100 * censored) / s.length : 0,
    min: s[0], max: s[s.length - 1], median: quantileSorted(s, 0.5),
    q1L: quantileSorted(L, 0.25), q3L: quantileSorted(L, 0.75), medianL: medL, madL: madScaled(L, medL), meanL, sdL,
    sorted: s, sortedLog: L,
  };
}

export const THRESHOLD_METHODS = [
  { id: "p90", label: "90th percentile", ref: "", assumption: "Flags 10 % of samples whether or not any are anomalous." },
  { id: "p95", label: "95th percentile", ref: "", assumption: "Flags 5 % of samples whether or not any are anomalous." },
  { id: "p98", label: "98th percentile", ref: "", assumption: "Flags 2 % of samples whether or not any are anomalous." },
  { id: "mean2sd", label: "Mean + 2 SD (log)", ref: "Hawkes & Webb 1962", assumption: "Assumes one log-normal population; outliers inflate the SD." },
  { id: "median2mad", label: "Median + 2 MAD (log)", ref: "Reimann et al. 2005", assumption: "Robust: barely moved by the outliers it looks for." },
  { id: "tukey", label: "Tukey upper fence (log)", ref: "Tukey 1977", assumption: "Robust: Q3 + 1.5 × IQR of log values." },
  { id: "probbreak", label: "Probability-plot break", ref: "Sinclair 1976", assumption: "Suggested bend between two populations; check it on the plot." },
];
export const MIN_N_BREAKS = 30; // the two-segment fits need enough points on each side to mean anything
export const MIN_N_ROBUST = 10;

// Every candidate for one population: { id: value | null }, plus the plot data the panel draws
export function candidateThresholds(summary) {
  const out = Object.fromEntries(THRESHOLD_METHODS.map((m) => [m.id, null]));
  if (!summary || !summary.n) return { values: out, prob: null };
  const { sorted: s, sortedLog: L, n } = summary;
  out.p90 = quantileSorted(s, 0.9); out.p95 = quantileSorted(s, 0.95); out.p98 = quantileSorted(s, 0.98);
  if (n >= MIN_N_ROBUST) {
    out.mean2sd = 10 ** (summary.meanL + 2 * summary.sdL);
    if (summary.madL > 0) out.median2mad = 10 ** (summary.medianL + 2 * summary.madL);
    out.tukey = 10 ** (summary.q3L + 1.5 * (summary.q3L - summary.q1L));
  }
  // probability plot: normal score of the plotting position (i - 0.5) / n against log10 value
  const prob = L.map((y, i) => [normalQuantile((i + 0.5) / n), y]);
  let probBreak = null;
  // A two-segment fit always finds SOME bend, even in one clean log-normal population (a finite sample's tail is never
  // straight), so a break is reported only when two lines leave at most 15 % of one line's squared residual over the
  // upper half, and only in the upper half (the threshold is the bend into the high tail). Calibrated by simulation
  // (40 seeds each, log-normal background median 30, log SD 0.2; anomalous population median 300, log SD 0.15):
  // with 2-5 % anomalous samples in 200-1,000 the ratio was 0.015-0.17, with none 0.14-0.89. Under ~200 samples the
  // two overlap (100 samples with 3 anomalous: 0.04-0.42), so small populations often get no suggested break.
  // Each side needs max(8, 1 % of n) points.
  const side = (m) => Math.max(8, Math.round(m * 0.01));
  const real = (b) => b && b.sse1 > 0 && b.sse <= 0.15 * b.sse1;
  if (n >= MIN_N_BREAKS) {
    const h = Math.floor(n / 2), up = prob.slice(h);
    const b = twoSegmentBreak(up.map((p) => p[0]), up.map((p) => p[1]), side(n));
    if (real(b)) { probBreak = { ...b, k: b.k + h }; out.probbreak = 10 ** L[probBreak.k]; }
  }
  return { values: out, prob: { points: prob, breakIndex: probBreak?.k ?? null } };
}

export function robustZ(value, summary) {
  if (!(value > 0) || !summary || !(summary.madL > 0)) return null;
  return (log10(value) - summary.medianL) / summary.madL;
}

// ---------- groups (populations) ----------
// groupBy: "none" | "medium" | "medium_source" | "attr:<column>" | "layer:<mapLayerId>:<field>" (the polygon the sample falls in)
// TASKS.csv #932 — "medium_source": medium x the `source` attribute every public sample carries (#846; the project's own
// samples have none). A public survey (decades old, another lab, digestion and sample density) and the property's own
// samples of the same medium are different populations: the plan they were built from says never to mix them without
// levelling, which GeoStrix does not do. It is the default wherever samples of more than one source are loaded.
export const PROJECT_SOURCE = "project samples";
export const hasMixedSources = (samples) => { let first; for (const s of samples) { const k = s.attrs?.source || PROJECT_SOURCE; if (first === undefined) first = k; else if (k !== first) return true; } return false; };
export const defaultPopulations = (samples) => (hasMixedSources(samples) ? "medium_source" : "medium");
export function groupOptions(surfaceSamples, mapLayers = []) {
  const opts = [{ value: "none", label: "All samples (one population)" }, { value: "medium", label: "Sampling medium" }];
  if (hasMixedSources(surfaceSamples)) opts.push({ value: "medium_source", label: "Sampling medium and source" });
  const attrs = new Map();
  surfaceSamples.forEach((s) => Object.keys(s.attrs || {}).forEach((k) => attrs.set(k, (attrs.get(k) || 0) + 1)));
  [...attrs.keys()].sort().forEach((k) => opts.push({ value: `attr:${k}`, label: k, kind: "column" }));
  mapLayers.filter((l) => l.geomType === "polygon" && l.features?.length).forEach((l) => (l.fields || []).forEach((f) => opts.push({ value: `layer:${l.id}:${f}`, label: `${l.name} › ${f}`, kind: "map" })));
  return opts;
}
export function groupKeyFn(groupBy, mapLayers = []) {
  if (!groupBy || groupBy === "none") return () => "All";
  if (groupBy === "medium") return (s) => s.medium || "(none)";
  if (groupBy === "medium_source") return (s) => `${s.medium || "(none)"} · ${s.attrs?.source || PROJECT_SOURCE}`; // #932
  if (groupBy.startsWith("attr:")) { const k = groupBy.slice(5); return (s) => { const v = s.attrs?.[k]; return v == null || v === "" ? "(blank)" : String(v); }; }
  if (groupBy.startsWith("layer:")) {
    const [, id, ...rest] = groupBy.split(":"), field = rest.join(":");
    const layer = mapLayers.find((l) => String(l.id) === id);
    if (!layer) return () => "(no layer)";
    const feats = layer.features.map((f) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      f.parts.forEach((r) => r.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }));
      return { f, box: [x0, y0, x1, y1] };
    });
    return (s) => {
      for (const { f, box } of feats) {
        if (s.x < box[0] || s.x > box[2] || s.y < box[1] || s.y > box[3]) continue;
        if (pointInRings([s.x, s.y], f.parts)) { const v = f.attributes?.[field]; return v == null || v === "" ? "(blank)" : String(v); }
      }
      return "(outside the map)";
    };
  }
  return () => "All";
}

// Samples of one element split into populations: [{ key, values, ids, summary }], largest first.
// valueOf(sample) -> number | null; censoredOf(sample) -> boolean
// TASKS.csv #931 — zeroOf(sample) -> boolean: a sample with no value that its source reported as 0 (a public layer with
// no below-detection marker). Counted per population as `zero`, never put in the values.
export function populations(samples, { valueOf, censoredOf = () => false, zeroOf = () => false, keyOf }) {
  const by = new Map();
  const group = (k) => { if (!by.has(k)) by.set(k, { key: k, values: [], idx: [], censored: 0, zero: 0 }); return by.get(k); };
  samples.forEach((s, i) => {
    const v = valueOf(s);
    if (!(v > 0)) { if (v == null && zeroOf(s)) group(keyOf(s)).zero++; return; }
    const g = group(keyOf(s));
    g.values.push(v); g.idx.push(i);
    if (censoredOf(s)) g.censored++;
  });
  return [...by.values()].map((g) => ({ ...g, summary: populationSummary(g.values, g.censored) })).filter((g) => g.summary).sort((a, b) => b.values.length - a.values.length);
}

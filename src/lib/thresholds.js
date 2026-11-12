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
import { isLabMetaField, fieldLabel } from "./labMetaFields.js"; // TASKS.csv #1828
import { pointInRings } from "./mapLayers.js";
import { quantileSorted, median } from "./arrayStats.js"; // TASKS.csv #1114
import { codeIndex, codeAt, NO_CODE } from "./sampleLithology.js"; // TASKS.csv #2510

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

// TASKS.csv #2196 (Matt's decision 2026-11-09) — drill assays are judged LENGTH-weighted: a 3 m composite counts three times a 1 m sample.
// Weighted quantile on sorted values with their weights: the plotting position of each value is the middle of its weight
// ((cum - w / 2) / W), interpolated linearly: with equal weights that is Hyndman & Fan type 5 (Hazen), close to but not the same as
// quantileSorted's type 7, so a weighted population's percentiles differ slightly from the surface ones even at equal lengths.
export function weightedQuantileSorted(s, w, p) {
  const n = s.length;
  if (!n) return NaN;
  if (n === 1) return s[0];
  let W = 0; for (let i = 0; i < n; i++) W += w[i];
  if (!(W > 0)) return quantileSorted(s, p);
  const pos = []; let c = 0;
  for (let i = 0; i < n; i++) { pos.push((c + w[i] / 2) / W); c += w[i]; }
  if (p <= pos[0]) return s[0];
  if (p >= pos[n - 1]) return s[n - 1];
  let i = 1; while (pos[i] < p) i++;
  const t = (p - pos[i - 1]) / (pos[i] - pos[i - 1] || 1);
  return s[i - 1] + (s[i] - s[i - 1]) * t;
}
// the plotting positions (cum - w / 2) / W of sorted values, for the probability plot
const plottingPositions = (w) => { let W = 0; for (const x of w) W += x; const out = []; let c = 0; for (const x of w) { out.push((c + x / 2) / W); c += x; } return out; };

// Summary of one population: n, censored count, linear quantiles, log10 location / spread. weights (#2196): one per value, or null
export function populationSummary(values, censored = 0, weights = null) {
  if (weights && weights.length === values.length) return weightedSummary(values, censored, weights);
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

// #2196 — the same summary, every statistic length-weighted (the log SD with the reliability-weights correction W - sum(w^2) / W)
function weightedSummary(values, censored, weights) {
  const pairs = [];
  for (let i = 0; i < values.length; i++) { const v = values[i], w = weights[i]; if (Number.isFinite(v) && v > 0 && Number.isFinite(w) && w > 0) pairs.push([v, w]); }
  if (!pairs.length) return null;
  pairs.sort((a, b) => a[0] - b[0]);
  const s = pairs.map((p) => p[0]), w = pairs.map((p) => p[1]), L = s.map(log10);
  let W = 0, W2 = 0, sum = 0; for (let i = 0; i < L.length; i++) { W += w[i]; W2 += w[i] * w[i]; sum += w[i] * L[i]; }
  const meanL = sum / W;
  let ss = 0; for (let i = 0; i < L.length; i++) ss += w[i] * (L[i] - meanL) ** 2;
  const denom = W - W2 / W, sdL = L.length > 1 && denom > 0 ? Math.sqrt(ss / denom) : 0;
  const medL = weightedQuantileSorted(L, w, 0.5);
  const dev = L.map((x, i) => [Math.abs(x - medL), w[i]]).sort((a, b) => a[0] - b[0]);
  const madL = 1.4826 * weightedQuantileSorted(dev.map((d) => d[0]), dev.map((d) => d[1]), 0.5);
  return {
    n: s.length, censored, censoredPct: s.length ? (100 * censored) / s.length : 0, weighted: true, totalWeight: W,
    min: s[0], max: s[s.length - 1], median: weightedQuantileSorted(s, w, 0.5),
    q1L: weightedQuantileSorted(L, w, 0.25), q3L: weightedQuantileSorted(L, w, 0.75), medianL: medL, madL, meanL, sdL,
    sorted: s, sortedLog: L, weights: w,
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
  const q = summary.weights ? (p) => weightedQuantileSorted(s, summary.weights, p) : (p) => quantileSorted(s, p); // #2196
  out.p90 = q(0.9); out.p95 = q(0.95); out.p98 = q(0.98);
  if (n >= MIN_N_ROBUST) {
    out.mean2sd = 10 ** (summary.meanL + 2 * summary.sdL);
    if (summary.madL > 0) out.median2mad = 10 ** (summary.medianL + 2 * summary.madL);
    out.tukey = 10 ** (summary.q3L + 1.5 * (summary.q3L - summary.q1L));
  }
  // probability plot: normal score of the plotting position (i - 0.5) / n against log10 value
  const pp = summary.weights ? plottingPositions(summary.weights) : null; // #2196 — a long interval takes more of the plot
  const prob = L.map((y, i) => [normalQuantile(pp ? pp[i] : (i + 0.5) / n), y]);
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

// TASKS.csv #2675 — Grade stats' cap candidates: the same probability-plot break Thresholds suggests (Sinclair 1976), from one
// population's values (length weights or null). null when there are too few values or no bend clear enough to report.
export function probabilityBreak(values, weights = null) {
  const s = populationSummary(values || [], 0, weights && weights.length === values?.length ? weights : null);
  return s ? candidateThresholds(s).values.probbreak : null;
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
  // TASKS.csv #1796 (review #1646, Kodiak) — only columns a population can be named by: 2-30 distinct values, not mostly numbers (64
  // columns were offered: free-text descriptions, sample weights, point numbers, 85 one-day dates); survey-style names first
  const attrs = new Map();
  surfaceSamples.forEach((s) => Object.entries(s.attrs || {}).forEach(([k, v]) => {
    if (k.endsWith("_lev_basis") || v == null || v === "") return; // #1001: an audit column; grouping by it would undo the levelling
    const a = attrs.get(k) || attrs.set(k, { vals: new Set(), num: 0, n: 0 }).get(k);
    a.n++; if (a.vals.size <= 31) a.vals.add(String(v)); if (Number.isFinite(Number(v))) a.num++;
  }));
  const FIRST = /target|horizon|lab|year|survey|program|grid|campaign|source|crew|batch/i;
  // TASKS.csv #1828 (review #1646, Kodiak) — a lab's bookkeeping columns (certificate, workflow, status per element, QC weights) come last,
  // as their own kind; a header's line breaks are shown as spaces
  const lab = (k) => (isLabMetaField(k) ? 1 : 0);
  [...attrs.entries()].filter(([, a]) => a.vals.size >= 2 && a.vals.size <= 30 && a.num < 0.5 * a.n)
    .sort(([k1], [k2]) => (lab(k1) - lab(k2)) || (FIRST.test(k2) - FIRST.test(k1)) || k1.localeCompare(k2))
    .forEach(([k]) => opts.push({ value: `attr:${k}`, label: fieldLabel(k), kind: lab(k) ? "labmeta" : "column" }));
  mapLayers.filter((l) => l.geomType === "polygon" && l.features?.length).forEach((l) => (l.fields || []).forEach((f) => opts.push({ value: `layer:${l.id}:${f}`, label: `${l.name} › ${f}`, kind: "map" })));
  return opts;
}
// samples (TASKS.csv #1796): when they hold more than one medium, a column or map-unit grouping is split by medium first ('soil · Eclipse'),
// so soils and rock chips are never one population (Kodiak's '(blank)' Target held 55 soils and 57 rock chips: P90 2,350 ppm Cu)
export function groupKeyFn(groupBy, mapLayers = [], samples = null) {
  if (!groupBy || groupBy === "none") return () => "All";
  if (samples && (groupBy.startsWith("attr:") || groupBy.startsWith("layer:")) && new Set(samples.map((s) => s.medium)).size > 1) {
    const inner = groupKeyFn(groupBy, mapLayers);
    return (s) => `${s.medium || "(none)"} · ${inner(s)}`;
  }
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
// weightOf (#2196): a sample's weight (an interval's length), or null for equal weights
export function populations(samples, { valueOf, censoredOf = () => false, zeroOf = () => false, keyOf, weightOf = null }) {
  const by = new Map();
  const group = (k) => { if (!by.has(k)) by.set(k, { key: k, values: [], idx: [], censored: 0, zero: 0, ...(weightOf ? { weights: [] } : {}) }); return by.get(k); };
  samples.forEach((s, i) => {
    const v = valueOf(s);
    // TASKS.csv #1391 — a 0 kept by the import (readAssayCell keeps value >= 0) is a reported zero too (below detection or not analysed),
    // counted as #931's flagged ones are: Silvertip's streams (12 Au = 0) and soils (10) were left out of n without a word
    if (!(v > 0)) { if ((v == null && zeroOf(s)) || v === 0) group(keyOf(s)).zero++; return; }
    const g = group(keyOf(s));
    g.values.push(v); g.idx.push(i);
    if (weightOf) g.weights.push(weightOf(s));
    if (censoredOf(s)) g.censored++;
  });
  return [...by.values()].map((g) => ({ ...g, summary: populationSummary(g.values, g.censored, g.weights || null) })).filter((g) => g.summary).sort((a, b) => b.values.length - a.values.length);
}

// TASKS.csv #2196 — drill assays: an interval's length, and the domain it sits in (the code of a logged layer at its middle depth)
export const intervalLength = (a) => { const f = Number(a.from), t = Number(a.to); return Number.isFinite(f) && Number.isFinite(t) && t > f ? t - f : null; };
export const DRILL_DOMAINS = [{ value: "none", label: "All assays" }, { value: "litho", label: "Lithology" }, { value: "alt", label: "Alteration" }, { value: "weath", label: "Weathering" }];
export function drillDomainKeyFn(domain, layers) {
  if (!domain || domain === "none") return () => "All";
  const index = codeIndex(layers?.[domain]); // #2510 — the shared rule (largest overlap), as the diagram filter and Grade stats use
  return (a) => codeAt(index, a.hole_id, a.from, a.to) ?? NO_CODE;
}
// a saved threshold for the surface tools (anomaly maps, catchments): not a drill one (#2196)
export const isSurfaceThreshold = (t) => t && t.source !== "drill";

// TASKS.csv #2507 (review #2486, WA lithium) — a rule whose threshold no sample of the population reaches (above its maximum, or over 100 for a
// per-cent unit): Median + 2 MAD gave 29.1 % Li on a population topping at 3.32 %, pre-selected and ready to save. -> true when unusable
export function thresholdUnreachable(value, summary, unit) {
  if (value == null || !Number.isFinite(value)) return false;
  return (Number.isFinite(summary?.max) && value > summary.max) || (String(unit).trim().startsWith("%") && value > 100);
}
// the rule to open on: the preferred one when every population can reach it, else none (null) — the review's advice: select nothing rather
// than silently swap in another rule (a percentile always "works" but flags its share whether or not anything is anomalous)
export function usableDefaultMethod(pops, preferred, unit) {
  const ok = (id) => pops.length > 0 && pops.every((p) => { const v = p.cand.values[id]; return v != null && Number.isFinite(v) && !thresholdUnreachable(v, p.summary, unit); });
  return ok(preferred) ? preferred : null;
}

// TASKS.csv #2347 (Matt's decision, split from #2196) — a saved DRILL threshold is offered to the drill tools, never applied: the rule, its
// population and the date it was decided, in the tool's unit (a record saved in another unit is not offered). A surface record never is.
// records: store.geochemThresholds -> [{ key, value, rule, population, decided }]
export function drillThresholdOffers(records, symbol, unit) {
  const r = (records || []).find((x) => x?.source === "drill" && x.symbol === symbol);
  if (!r || (unit && r.unit && r.unit !== unit)) return [];
  return Object.entries(r.values || {}).filter(([, v]) => Number.isFinite(v) && v > 0).map(([key, value]) => ({ key, value, rule: r.methodLabel || r.method, population: key === "all" || key === "" ? null : `${r.groupLabel}: ${key}`, decided: r.decided }));
}

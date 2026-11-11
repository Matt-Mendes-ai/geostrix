// TASKS.csv #1678 (review #1645, Copley) — a SWIR white-mica wavelength, an oxidation index or a mag-susc reading could not be plotted
// against an element: every Geochem diagram is a fixed classification. The X-Y scatter takes any two axes: an assay element, or a
// numeric downhole log / custom-layer field (numericSources.js), read for each sample at its mid-depth from the interval of the same
// hole that covers it (a depth-only reading stands for its own short support, as sourceAssays gives it). Pure.
import { valueIn } from "./geochem.js";
import { sourceAssays } from "./numericSources.js";
import { correlate } from "./correlation.js"; // TASKS.csv #2353

// intervals [{ hole_id, from, to, values: { [symbol]: v } }] -> (sample) => the value at the sample's mid-depth, or null
export function depthLookup(intervals, symbol) {
  const byHole = new Map();
  for (const r of intervals || []) (byHole.get(r.hole_id) || byHole.set(r.hole_id, []).get(r.hole_id)).push(r);
  for (const list of byHole.values()) list.sort((a, b) => a.from - b.from);
  return (s) => {
    const list = byHole.get(s?.hole_id);
    const from = Number(s?.from), to = Number(s?.to);
    if (!list || !Number.isFinite(from)) return null;
    const mid = Number.isFinite(to) && to > from ? (from + to) / 2 : from;
    let lo = 0, hi = list.length - 1, at = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].from <= mid) { at = m; lo = m + 1; } else hi = m - 1; } // the last interval starting at or above mid
    for (let i = at; i >= 0 && i >= at - 3; i--) { const r = list[i]; if (r.from <= mid && mid <= r.to) { const v = r.values?.[symbol]; return Number.isFinite(v) ? v : null; } }
    return null;
  };
}

// TASKS.csv #2353 (review #2325, WA uranium) — a log against a sample is the log's length-weighted mean over the sample's own interval (the
// mid-depth 0.5 m bin differed from the interval mean by more than 25 % on 9.8 % of the 2-4 m aircore composites); a sample with no interval
// (a point) reads at its depth, as before. -> (sample) => the mean, or null when no log row overlaps it
export function intervalLookup(intervals, symbol) {
  const byHole = new Map();
  for (const r of intervals || []) if (Number.isFinite(r.values?.[symbol])) (byHole.get(r.hole_id) || byHole.set(r.hole_id, []).get(r.hole_id)).push(r);
  for (const list of byHole.values()) list.sort((a, b) => a.from - b.from);
  const atDepth = depthLookup(intervals, symbol);
  return (s) => {
    const from = Number(s?.from), to = Number(s?.to);
    if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) return atDepth(s);
    const list = byHole.get(s?.hole_id);
    if (!list) return null;
    let lo = 0, hi = list.length - 1, start = list.length;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].to > from) { start = m; hi = m - 1; } else lo = m + 1; } // the first row ending below the top
    let sw = 0, sv = 0;
    for (let i = Math.max(0, start - 4); i < list.length && list[i].from < to; i++) {
      const r = list[i], ov = Math.min(r.to, to) - Math.max(r.from, from);
      if (ov > 0) { sw += ov; sv += ov * r.values[symbol]; }
    }
    return sw > 0 ? sv / sw : atDepth(s);
  };
}

// an axis choice -> { label, value(sample, units) }. choice: { kind: "element", symbol, unit } | a numericSourceChoices entry
export function axisOf(choice, ctx) {
  if (!choice) return null;
  if (choice.kind === "element") return { label: choice.unit ? `${choice.symbol} (${choice.unit})` : choice.symbol, value: (s, u) => valueIn(s, choice.symbol, choice.unit || undefined, u) };
  const { assays } = sourceAssays(choice, ctx);
  const at = intervalLookup(assays, choice.symbol); // #2353 — averaged over the sample's interval
  return { label: choice.unit && choice.unit !== "as logged" ? `${choice.label} (${choice.unit})` : choice.label, value: (s) => at(s) };
}

// The scatter as a diagram GeochemPlot draws: its ranges fitted to the samples' values (a log axis when they are all positive and
// span two decades or more), so a 2,190-2,215 nm wavelength is not drawn against an axis anchored at 0.
// opts.oneToOne (#2353): a 1:1 line across the range both axes share
export function xyDiagram(xAxis, yAxis, samples, units, opts = {}) {
  if (!xAxis || !yAxis) return null;
  const xs = [], ys = [];
  for (const s of samples || []) { const x = xAxis.value(s, units), y = yAxis.value(s, units); if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } }
  const fit = (v) => {
    if (!v.length) return { range: [0, 1], log: false };
    let lo = Infinity, hi = -Infinity; for (const a of v) { if (a < lo) lo = a; if (a > hi) hi = a; }
    const log = lo > 0 && hi / lo >= 100;
    if (log) return { range: [lo / 1.15, hi * 1.15], log };
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.1 || 1;
    return { range: [lo - pad, hi + pad], log };
  };
  const fx = fit(xs), fy = fit(ys);
  return {
    id: "xy", label: "X–Y scatter (choose the axes)", requires: [],
    caption: "Any two axes: assay elements, or a downhole log / custom-layer field averaged over each sample's interval in the same hole (length-weighted).",
    xLabel: xAxis.label, yLabel: yAxis.label, logX: fx.log, logY: fy.log, xRange: fx.range, yRange: fy.range,
    ...(opts.oneToOne ? (() => { const lo = Math.max(fx.range[0], fy.range[0]), hi = Math.min(fx.range[1], fy.range[1]); return hi > lo ? { tieLines: [{ from: [lo, lo], to: [hi, hi], label: "1:1" }] } : {}; })() : {}),
    project: (s, u) => { const x = xAxis.value(s, u), y = yAxis.value(s, u); return Number.isFinite(x) && Number.isFinite(y) && (!fx.log || x > 0) && (!fy.log || y > 0) ? { x, y } : null; },
  };
}

// TASKS.csv #2353 — one line of numbers under an X-Y plot, over the samples with X >= xMin (when given): n, Spearman's r, the median of Y / X
// and the length-weighted ratio sum(Y x length) / sum(X x length) (the metal ratio of a gamma log against its assays). Ratios over X > 0.
export function xyStats(xAxis, yAxis, samples, units, { xMin = null } = {}) {
  const xs = [], ys = [], ratios = [];
  let sx = 0, sy = 0;
  for (const s of samples || []) {
    const x = xAxis?.value(s, units), y = yAxis?.value(s, units);
    if (!Number.isFinite(x) || !Number.isFinite(y) || (xMin != null && !(x >= xMin))) continue;
    xs.push(x); ys.push(y);
    if (x > 0) {
      ratios.push(y / x);
      const len = Number(s.to) - Number(s.from), w = Number.isFinite(len) && len > 0 ? len : 1;
      sx += x * w; sy += y * w;
    }
  }
  ratios.sort((a, b) => a - b);
  return { n: xs.length, r: xs.length >= 3 ? correlate(xs, ys, "spearman").r : NaN, medianRatio: ratios.length ? ratios[ratios.length >> 1] : NaN, weightedRatio: sx > 0 ? sy / sx : NaN };
}

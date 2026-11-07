// TASKS.csv #1678 (review #1645, Copley) — a SWIR white-mica wavelength, an oxidation index or a mag-susc reading could not be plotted
// against an element: every Geochem diagram is a fixed classification. The X-Y scatter takes any two axes: an assay element, or a
// numeric downhole log / custom-layer field (numericSources.js), read for each sample at its mid-depth from the interval of the same
// hole that covers it (a depth-only reading stands for its own short support, as sourceAssays gives it). Pure.
import { valueIn } from "./geochem.js";
import { sourceAssays } from "./numericSources.js";

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

// an axis choice -> { label, value(sample, units) }. choice: { kind: "element", symbol, unit } | a numericSourceChoices entry
export function axisOf(choice, ctx) {
  if (!choice) return null;
  if (choice.kind === "element") return { label: choice.unit ? `${choice.symbol} (${choice.unit})` : choice.symbol, value: (s, u) => valueIn(s, choice.symbol, choice.unit || undefined, u) };
  const { assays } = sourceAssays(choice, ctx);
  const at = depthLookup(assays, choice.symbol);
  return { label: choice.unit && choice.unit !== "as logged" ? `${choice.label} (${choice.unit})` : choice.label, value: (s) => at(s) };
}

// The scatter as a diagram GeochemPlot draws: its ranges fitted to the samples' values (a log axis when they are all positive and
// span two decades or more), so a 2,190-2,215 nm wavelength is not drawn against an axis anchored at 0.
export function xyDiagram(xAxis, yAxis, samples, units) {
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
    caption: "Any two axes: assay elements, or a downhole log / custom-layer field read at each sample's mid-depth in the same hole.",
    xLabel: xAxis.label, yLabel: yAxis.label, logX: fx.log, logY: fy.log, xRange: fx.range, yRange: fy.range,
    project: (s, u) => { const x = xAxis.value(s, u), y = yAxis.value(s, u); return Number.isFinite(x) && Number.isFinite(y) && (!fx.log || x > 0) && (!fy.log || y > 0) ? { x, y } : null; },
  };
}

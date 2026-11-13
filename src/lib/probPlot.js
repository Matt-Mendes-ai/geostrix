// TASKS.csv #1388 (review #1352, Silvertip) — Grade statistics had no log-probability plot, the standard tool for a capping
// decision (Sinclair 1976): Compositing offered "cap at the length-weighted P97.5 = 18.33 / P99 = 46" with nothing to show where
// the Ag population breaks. Length-weighted, as Compositing reads the assays: a 3 m interval is ten 0.3 m ones.
import { normalQuantile } from "./thresholds.js";
import { sortedWeighted } from "./arrayStats.js"; // TASKS.csv #2910 — one native sort shared by the percentiles and the points

// values, weights (null: every sample weight 1) -> { points: [[normal score, log10 value]] ascending, excluded: n of values <= 0 }
// Plotting position of a sample: the share of the total length below its middle, (cumulative length - its length / 2) / total.
// A zero or negative value still counts in the total (it is sampled core), but cannot be drawn on a log axis.
// TASKS.csv #2912 — { log: false } gives [normal score, value] (an arithmetic probability plot, for a grade that is not log-normal), zeros drawn
export function weightedProbPoints(values, weights = null, { log = true } = {}) {
  const { v: sv, w: sw, n, total } = sortedWeighted(values, weights, { coerce: true }); // #2910 — Number() as before
  const points = [];
  let acc = 0, excluded = 0;
  for (let k = 0; k < n; k++) {
    const v = sv[k], w = sw[k];
    const pos = (acc + w / 2) / total;
    acc += w;
    if (!log) points.push([normalQuantile(pos), v]);
    else if (v > 0) points.push([normalQuantile(pos), Math.log10(v)]);
    else excluded++;
  }
  return { points, excluded };
}

// the value below which p % of the length lies — the rule of geochem.js lengthWeightedPercentile, which Compositing's cap uses
export function weightedPercentile(values, weights, p) {
  const { v, w, n, total } = sortedWeighted(values, weights, { coerce: true }); // #2910 — sorted once for every percentile of the same arrays
  if (!total) return null;
  const target = (p / 100) * total;
  let acc = 0;
  for (let k = 0; k < n; k++) { acc += w[k]; if (acc >= target - 1e-9) return v[k]; }
  return v[n - 1];
}

// what capping at `cap` does: samples above it, and the share of the metal (grade x length) removed
export function capEffect(values, weights, cap) {
  let metal = 0, removed = 0, n = 0, above = 0;
  for (let i = 0; i < (values || []).length; i++) {
    const v = Number(values[i]), w = weights ? Number(weights[i]) : 1;
    if (!Number.isFinite(v) || !(w > 0)) continue;
    n++; metal += Math.max(0, v) * w;
    if (v > cap) { above++; removed += (v - cap) * w; }
  }
  return { n, above, pctMetalRemoved: metal > 0 ? (100 * removed) / metal : 0 };
}

// TASKS.csv #1512 (review #1497, Lawyers) — the plot kept every Nth point by rank (every 139th of 83,670 Au assays): the top dot was
// 12.9 g/t though the maximum is 136 and 160 intervals pass 10 g/t, so the high-grade tail a cap is chosen from was not drawn.
// One point per screen pixel instead: the dense middle collapses to a line of pixels, every sparse tail point stays.
// points: [[x, y]] data; X, Y: data -> px. -> the points to draw (in their order)
export function thinToPixels(points, X, Y) {
  const seen = new Set(), out = [];
  for (const p of points || []) {
    const k = `${Math.round(X(p[0]))},${Math.round(Y(p[1]))}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

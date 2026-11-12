// TASKS.csv #2672 (#1712) — a numeric downhole log (magnetic susceptibility, SG, gamma) as a covariate of the assays in Grade stats: the
// samples grouped by the log's quartiles, the log read for each sample as its length-weighted mean over the sample's interval (point
// readings included, the X-Y scatter's rule, geochemXY intervalLookup / #2353). The class breaks are the samples' own quartiles, so they
// follow this project's values; a sample no reading reaches is 'no reading'. Pure.
import { axisOf } from "./geochemXY.js";
import { quantileSorted } from "./arrayStats.js";

export const NO_READING = "no reading";
export const MIN_LOG_SAMPLES = 8; // fewer: no quartiles worth the name

const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(+v.toPrecision(3)));

// choice: a numericSourceChoices entry; ctx: { layers, customLayers }; samples: the rows to classify (hole_id, from, to)
// -> { classOf(sample) -> label, order: [labels…, NO_READING], breaks, unit } or null with too few readings
export function logClasses(choice, ctx, samples) {
  const axis = axisOf(choice, ctx);
  if (!axis) return null;
  const memo = new Map();
  const valueOf = (s) => { if (!memo.has(s)) memo.set(s, axis.value(s)); return memo.get(s); };
  const vals = [];
  for (const s of samples || []) { const v = valueOf(s); if (Number.isFinite(v)) vals.push(v); }
  if (vals.length < MIN_LOG_SAMPLES) return null;
  vals.sort((a, b) => a - b);
  const breaks = [...new Set([0.25, 0.5, 0.75].map((p) => quantileSorted(vals, p)))];
  const labels = breaks.length
    ? [`< ${fmt(breaks[0])}`, ...breaks.slice(1).map((b, i) => `${fmt(breaks[i])} – ${fmt(b)}`), `≥ ${fmt(breaks[breaks.length - 1])}`]
    : ["all"];
  const classOf = (s) => {
    const v = valueOf(s);
    if (!Number.isFinite(v)) return NO_READING;
    let i = 0;
    while (i < breaks.length && v >= breaks[i]) i++;
    return labels[i];
  };
  return { classOf, order: [...labels, NO_READING], breaks, unit: axis.unit || "" };
}

// the order to list the classes in: low to high, 'no reading' last (groups are otherwise listed by size)
export function logClassRank(label) {
  const s = String(label);
  if (s === NO_READING) return Infinity;
  if (s.startsWith("< ")) return -Infinity;
  if (s.startsWith("≥ ")) return Number.MAX_VALUE;
  const v = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(v) ? v : Number.MAX_VALUE;
}

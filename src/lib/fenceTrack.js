// TASKS.csv #2786 (split from #1745) — a numeric track beside each Fence diagram column: an assay element or a numeric log (gamma, RQD %,
// a numeric custom layer), drawn on the hole's own depth as bars (intervals) or a line (point readings). One scale for the whole panel,
// so a bar means the same in every hole; its top end is the 98th percentile of the shown values, so one spike does not flatten the rest.
import { LAYER_META } from "./layers.js";
import { isNumericLayer } from "./domainLayers.js";

// -> [{ key, label, kind: "assay" | "layer", symbol?, rows? }]; label(text) translates a built-in layer's label
export function numericTrackSources({ layers = {}, customLayers = [], assays = [], assayElements = [] } = {}, label = (s) => s) {
  const out = [];
  if ((assays || []).length) {
    for (const e of assayElements || []) {
      const symbol = typeof e === "string" ? e : e?.symbol;
      if (!symbol) continue;
      out.push({ key: `assay:${symbol}`, label: e?.unit ? `${symbol} (${e.unit})` : symbol, kind: "assay", symbol });
    }
  }
  for (const [k, m] of Object.entries(LAYER_META)) {
    if (m.numeric && (m.kind === "interval" || m.kind === "point") && (layers[k] || []).length) out.push({ key: k, label: label(m.label), kind: "layer", rows: layers[k] });
  }
  for (const c of customLayers || []) if ((c.rows || []).length && isNumericLayer(c.rows)) out.push({ key: `custom:${c.id}`, label: c.name, kind: "layer", rows: c.rows });
  return out;
}

const num = (v) => (v === null || v === "" || v === undefined ? NaN : Number(v));

// The source's rows of the given holes: { byHole: { id: [{ from, to, v } | { at, v }] sorted by depth }, lo, hi, above, points, n }.
// `above` counts values past `hi`, drawn at full length.
// opts.log (#2813): a log scale from the 2nd percentile of the positive values to the highest (gamma and grades are skewed); `below` then
// counts the values at or under that start (zero, negative or below it), drawn at zero width. `positive` counts the values above 0.
export function numericTrackRows(src, holeIds, assays = [], opts = {}) {
  const want = new Set(holeIds || []);
  const byHole = {};
  const vals = [];
  let points = false;
  const add = (id, r) => { (byHole[id] = byHole[id] || []).push(r); vals.push(r.v); };
  if (src?.kind === "assay") {
    for (const a of assays || []) {
      if (!want.has(a.hole_id)) continue;
      const v = num(a.values?.[src.symbol]), from = num(a.from), to = num(a.to);
      if (Number.isFinite(v) && Number.isFinite(from) && to > from) add(a.hole_id, { from, to, v });
    }
  } else if (src?.rows) {
    for (const r of src.rows) {
      if (!want.has(r.hole_id)) continue;
      const v = num(r.value);
      if (!Number.isFinite(v)) continue;
      const from = num(r.from), to = num(r.to), at = num(r.depth);
      if (Number.isFinite(from) && to > from) add(r.hole_id, { from, to, v });
      else if (Number.isFinite(at)) { add(r.hole_id, { at, v }); points = true; }
    }
  }
  for (const rows of Object.values(byHole)) rows.sort((a, b) => (a.at ?? a.from) - (b.at ?? b.from));
  if (!vals.length) return { byHole, lo: 0, hi: 1, above: 0, points, n: 0, positive: 0, log: false, below: 0 };
  const sorted = Float64Array.from(vals).sort();
  let first = 0;
  while (first < sorted.length && !(sorted[first] > 0)) first++;
  const positive = sorted.length - first;
  if (opts.log && positive >= 2 && sorted[sorted.length - 1] > sorted[first]) {
    const lo = sorted[first + Math.floor(0.02 * (positive - 1))];
    let hi = sorted[sorted.length - 1];
    if (!(hi > lo)) hi = lo * 10;
    let below = 0;
    for (const v of vals) if (!(v > lo)) below++;
    return { byHole, lo, hi, above: 0, points, n: vals.length, positive, log: true, below };
  }
  const lo = Math.min(0, sorted[0]);
  let hi = sorted[Math.min(sorted.length - 1, Math.floor(0.98 * (sorted.length - 1)))];
  if (!(hi > lo)) hi = sorted[sorted.length - 1] > lo ? sorted[sorted.length - 1] : lo + 1;
  let above = 0;
  for (const v of vals) if (v > hi) above++;
  return { byHole, lo, hi, above, points, n: vals.length, positive, log: false, below: 0 };
}

// 0..1 along the track for a value (clamped); log: on log10 between lo and hi (lo > 0), zero for a value at or under lo
export const trackFraction = (v, lo, hi, log = false) => {
  if (log) return v > lo ? Math.min(1, Math.log(v / lo) / Math.log(hi / lo || 10)) : 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
};

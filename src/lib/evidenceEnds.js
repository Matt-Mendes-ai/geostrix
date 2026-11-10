// TASKS.csv #1565 (review #1497, Lawyers) — a card's default membership ends, from its values over the grid: the 10th / 90th
// percentiles (a distance: 0 and the median), as on Add (#1179). Switching a Samples card from soil to rock chip recomputed the values
// (reach 320 -> 510 m) but kept the soil's ends (0 = -0.849, 1 = 0.784); the ends now follow the values until the user types one.
// Distance-to-drilling, picked points and zones have ends set from the site spacing, not from these values: null (left as they are).
import { quantileSorted } from "./arrayStats.js";

export const RESETTABLE_KINDS = new Set(["element", "index", "survey", "grade", "pxrf", "numeric", "voxel", "raster", "distance", "solid"]);
// kind, values (any array, NaN = no value) -> { low, high, log } or null
// TASKS.csv #2099 (review #2013, Woodjam) — a drill-grade card's default ends from the samples themselves, length-weighted: the 50th and
// 95th percentiles. Over the grid, the 10th / 90th percentile of IDW'd 25 m bin MAXIMA gave 2,490 / 32,400 ppm Cu where the core assays'
// P50 / P90 are 419 / 4,120 ppm, so the overlay ranked whoever held the bonanza sample. rows: assay-shaped intervals; valueOf(row) -> the
// grade in the card's unit or null. -> { low, high, log, n, q: [50, 95] } | null (under 10 samples with a positive grade)
// TASKS.csv #2448 (review #2325, WA uranium) — mapped: the values the card actually maps (each 25 m plan bin's highest interval,
// holeGradePoints). On the WA uranium the assays' P95 (207 ppm) sat under the median hole maximum (359 ppm): 58 % of the scored cells were
// at the top score and a 9,700 ppm hole read as a 210 ppm one. The top end is the larger of the assays' P95 and the 90th percentile of the
// mapped values; the low end stays the assays' P50 (#2099: from the bin maxima it left most holes at 0). -> { ..., highFrom: "assays" | "mapped", m }
export function gradeEndsFromSamples(rows, valueOf, { qLow = 0.5, qHigh = 0.95, mapped = null } = {}) {
  const s = [];
  for (const r of rows || []) {
    const v = valueOf(r);
    if (!(Number.isFinite(v) && v > 0)) continue;
    const w = Number(r.to) - Number(r.from);
    s.push([v, Number.isFinite(w) && w > 0 ? w : 1]);
  }
  if (s.length < 10) return null;
  s.sort((a, b) => a[0] - b[0]);
  const total = s.reduce((t, x) => t + x[1], 0);
  const at = (q) => { let c = 0; for (const [v, w] of s) { c += w; if (c >= q * total) return v; } return s[s.length - 1][0]; };
  const low = at(qLow), assayHigh = at(qHigh);
  const mv = (mapped || []).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const mappedHigh = mv.length >= 10 ? quantileSorted(mv, 0.9) : null;
  const high = mappedHigh != null && mappedHigh > assayHigh ? mappedHigh : assayHigh;
  return high > low ? { low, high, log: true, n: s.length, q: [Math.round(qLow * 100), Math.round(qHigh * 100)], highFrom: high === assayHigh ? "assays" : "mapped", m: mv.length } : null;
}

// TASKS.csv #2448 — the share of the scored cells at the top score (to 1e-6): over a third means the 1 = point sits under most of the data
export function topScoreShare(score) {
  let n = 0, top = -Infinity, at = 0;
  for (const v of score || []) if (Number.isFinite(v)) { n++; if (v > top) top = v; }
  if (!n) return null;
  for (const v of score) if (Number.isFinite(v) && v >= top - 1e-6) at++;
  return { share: at / n, at, n, top };
}

export function defaultEvidenceEnds(kind, values) {
  if (!RESETTABLE_KINDS.has(kind)) return null;
  const finite = Float64Array.from((values || []).filter(Number.isFinite));
  if (!finite.length) return null;
  finite.sort();
  if (kind === "distance" || kind === "solid") return { low: 0, high: quantileSorted(finite, 0.5), log: false };
  const low = quantileSorted(finite, 0.1), high = quantileSorted(finite, 0.9);
  return { low, high, log: (kind === "grade" || kind === "pxrf") && low > 0 && high > low };
}

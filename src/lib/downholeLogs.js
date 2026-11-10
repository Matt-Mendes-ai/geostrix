// TASKS.csv #1425 / #1708 (reviews #1352 Silvertip, #1645 Copley) — petrophysics from the drillholes: a downhole log (mag susc, SG,
// RQD, recovery, a custom numeric field) grouped by a logged code (lithology, alteration, a custom layer) as box statistics, and
// against an assay element reading by reading (the reading's midpoint inside the assay interval of the same hole), with Spearman's
// rank correlation. The log rows come in assay-shaped from numericSources.js sourceAssays(). Pure.
import { quantileSorted } from "./arrayStats.js";
import { correlate } from "./correlation.js";
import { domainOfInterval } from "./domainLayers.js";
import { valueIn } from "./geochem.js";

export function boxStats(values) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  return { n: s.length, min: s[0], q1: quantileSorted(s, 0.25), median: quantileSorted(s, 0.5), q3: quantileSorted(s, 0.75), max: s[s.length - 1] };
}

// rows: assay-shaped log rows { hole_id, from, to, values: { [symbol]: v } }; domainRows: the categorical layer's intervals.
// -> [{ key: code, stats, n }] by median descending, plus the readings outside every interval of the layer under "(not logged)"
export const NOT_LOGGED = "(not logged)";
// TASKS.csv #2393 (review #2325, WA uranium) — a skewed log ranked by its median hides the host: lignite (38 % of the assayed uranium) was
// 9th of 19 by median gamma and shale (no reading over 100 ppm) 2nd. stat: "median" (default, for symmetric logs: SG, RQD), "mean", "p90",
// or "above" (the share of readings above `above`); each group gets `value` (and `nAbove`), and the groups are sorted by it.
export function logByCode(rows, symbol, domainRows, { minN = 3, stat = "median", above = null } = {}) {
  const codeOf = domainOfInterval(domainRows);
  const groups = new Map();
  for (const r of rows) {
    const v = r.values?.[symbol];
    if (!Number.isFinite(v)) continue;
    const code = codeOf(r) ?? NOT_LOGGED;
    (groups.get(code) || groups.set(code, []).get(code)).push(v);
  }
  const out = [];
  const thr = Number(above);
  for (const [key, vals] of groups) {
    const stats = boxStats(vals);
    if (!stats || stats.n < minN) continue;
    let value = stats.median, nAbove;
    if (stat === "mean") value = vals.reduce((s, v) => s + v, 0) / vals.length;
    else if (stat === "p90") value = quantileSorted([...vals].sort((a, b) => a - b), 0.9);
    else if (stat === "above" && Number.isFinite(thr)) { nAbove = vals.filter((v) => v > thr).length; value = (100 * nAbove) / vals.length; }
    out.push({ key, stats, n: stats.n, value, ...(nAbove != null ? { nAbove } : {}) });
  }
  return out.sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key)));
}

// the log against an assay element: each reading paired with the assay interval of its hole that holds its midpoint
// -> { pairs: [[log, assay]], n, r (Spearman), rLog (Pearson of log10 values), unit }
export function logVsAssay(rows, symbol, assays, element, elementUnits = {}) {
  const byHole = new Map();
  for (const a of assays || []) { if (a.source === "pXRF" || !Number.isFinite(a.from) || !Number.isFinite(a.to)) continue; (byHole.get(a.hole_id) || byHole.set(a.hole_id, []).get(a.hole_id)).push(a); }
  byHole.forEach((l) => l.sort((x, y) => x.from - y.from));
  const unit = elementUnits[element] || "ppm";
  const pairs = [];
  for (const r of rows) {
    const v = r.values?.[symbol];
    const list = byHole.get(r.hole_id);
    if (!Number.isFinite(v) || !list) continue;
    const mid = (r.from + r.to) / 2;
    const hit = list.find((a) => mid >= a.from && mid < a.to);
    if (!hit) continue;
    const g = valueIn(hit, element, unit, elementUnits);
    if (g == null || !Number.isFinite(g)) continue;
    pairs.push([v, g]);
  }
  if (pairs.length < 3) return { pairs, n: pairs.length, r: NaN, rLog: NaN, unit };
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
  return { pairs, n: pairs.length, r: correlate(xs, ys, "spearman").r, rLog: correlate(xs, ys, "log").r, unit };
}

// TASKS.csv #1595 (review #1497, Lawyers) — a log against a block model evaluated onto the holes ('On holes: <model>', GeophysicsModule
// evaluateOnHoles): each reading paired with the model cell the hole crosses at its midpoint. The reviewer had to do this by hand for
// the MVI amplitude against the 23,575 mag-susc readings (Spearman 0.04 over 1,486 pairs). Spearman is unaffected by the units (a log in
// x10^-3 SI against a model in SI); the medians are each in their own unit. -> { pairs, n, r, rLog, medianLog, medianModel }
export function logVsModel(rows, symbol, modelRows) {
  const byHole = new Map();
  for (const m of modelRows || []) { if (!Number.isFinite(m.from) || !Number.isFinite(m.to) || !Number.isFinite(Number(m.value))) continue; (byHole.get(m.hole_id) || byHole.set(m.hole_id, []).get(m.hole_id)).push(m); }
  byHole.forEach((l) => l.sort((x, y) => x.from - y.from));
  const pairs = [];
  for (const r of rows || []) {
    const v = r.values?.[symbol], list = byHole.get(r.hole_id);
    if (!Number.isFinite(v) || !list) continue;
    const mid = (r.from + r.to) / 2, hit = list.find((m) => mid >= m.from && mid < m.to);
    if (hit) pairs.push([v, Number(hit.value)]);
  }
  const med = (a) => { if (!a.length) return NaN; const s2 = [...a].sort((x, y) => x - y), k = Math.floor(s2.length / 2); return s2.length % 2 ? s2[k] : (s2[k - 1] + s2[k]) / 2; };
  if (pairs.length < 3) return { pairs, n: pairs.length, r: NaN, rLog: NaN, medianLog: NaN, medianModel: NaN };
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
  return { pairs, n: pairs.length, r: correlate(xs, ys, "spearman").r, rLog: correlate(xs, ys, "log").r, medianLog: med(xs), medianModel: med(ys) };
}

// TASKS.csv #2331 (review #2325, WA uranium) — the scatter drew one SVG circle per pair: 172,983 on the 5 cm gamma log, a 209 s stall (the
// statistics themselves take well under a second at that size). At most `max` points are drawn: every n-th pair, plus the pairs at the four
// extremes so the outliers still show; the statistics use every pair. -> { points, step } (step 1: all drawn)
export const SCATTER_MAX = 3000;
export function strideSample(pts, max = SCATTER_MAX) {
  if (!pts || pts.length <= max) return { points: pts || [], step: 1 };
  const step = Math.ceil(pts.length / max), keep = new Set();
  for (let i = 0; i < pts.length; i += step) keep.add(i);
  let ix0 = 0, ix1 = 0, iy0 = 0, iy1 = 0;
  pts.forEach(([x, y], i) => { if (x < pts[ix0][0]) ix0 = i; if (x > pts[ix1][0]) ix1 = i; if (y < pts[iy0][1]) iy0 = i; if (y > pts[iy1][1]) iy1 = i; });
  [ix0, ix1, iy0, iy1].forEach((i) => keep.add(i));
  return { points: [...keep].sort((a, b) => a - b).map((i) => pts[i]), step };
}

// TASKS.csv #1425 / #1708 (reviews #1352 Silvertip, #1645 Copley) — petrophysics from the drillholes: a downhole log (mag susc, SG,
// RQD, recovery, a custom numeric field) grouped by a logged code (lithology, alteration, a custom layer) as box statistics, and
// against an assay element reading by reading (the reading's midpoint inside the assay interval of the same hole), with Spearman's
// rank correlation. The log rows come in assay-shaped from numericSources.js sourceAssays(). Pure.
import { quantileSorted } from "./arrayStats.js";
import { correlate } from "./correlation.js";
import { valueIn } from "./geochem.js";

// TASKS.csv #2948 (review #2876, WA iron: 484,531 bins, 4 to 8 s per choice) — each reading was matched to its code, its assay interval and
// its model cell with Array.find over the hole's intervals. intervalLookup(items, ok) -> (hole, depth) => the item holding the depth: a binary
// search when the hole's intervals do not overlap (a log, a strand, an assay table), else the first by depth that holds it, as find gave.
// The same answer either way; items failing `ok`, or without to > from, can never hold a depth and are left out.
function intervalLookup(items, ok = () => true) {
  const byHole = new Map();
  for (const it of items || []) { if (!ok(it) || !(Number(it.to) > Number(it.from))) continue; (byHole.get(it.hole_id) || byHole.set(it.hole_id, []).get(it.hole_id)).push(it); }
  const holes = new Map();
  byHole.forEach((list, h) => {
    list.sort((a, b) => a.from - b.from);
    const n = list.length, from = new Float64Array(n), to = new Float64Array(n);
    let apart = true;
    for (let i = 0; i < n; i++) { from[i] = Number(list[i].from); to[i] = Number(list[i].to); if (i && to[i - 1] > from[i]) apart = false; }
    holes.set(h, { list, from, to, apart });
  });
  return (hole, m) => {
    const e = holes.get(hole);
    if (!e) return null;
    const { list, from, to } = e;
    if (!e.apart) { for (let i = 0; i < list.length; i++) if (m >= from[i] && m < to[i]) return list[i]; return null; }
    let lo = 0, hi = list.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (from[mid] <= m) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    return k >= 0 && m < to[k] ? list[k] : null;
  };
}
// the number of values above thr in an ascending array
function countAbove(s, thr) { let lo = 0, hi = s.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] <= thr) lo = mid + 1; else hi = mid; } return s.length - lo; }

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
export function logByCode(rows, symbol, domainRows, opts = {}) {
  return rankLogGroups(groupLogByCode(rows, symbol, domainRows), opts);
}
// TASKS.csv #2948 — the grouping is the slow half (every reading looked up in the code layer) and does not depend on the ranking: done once
// per (log, code layer) and kept by the pane, each code's readings sorted once (a Float64Array) with their sum in reading order, so a change of
// Rank codes by (median, mean, P90, share above) reads the kept arrays. The code at a reading is the code layer's interval holding its midpoint
// (the first by depth when they overlap), as domainOfInterval gives. -> Map(code -> { sorted, sum })
export function groupLogByCode(rows, symbol, domainRows) {
  const codeAt = intervalLookup(domainRows);
  const groups = new Map();
  for (const r of rows || []) {
    const v = r.values?.[symbol];
    if (!Number.isFinite(v)) continue;
    const hit = codeAt(r.hole_id, (Number(r.from) + Number(r.to)) / 2);
    const code = hit ? String(hit.value ?? "") : NOT_LOGGED;
    let g = groups.get(code);
    if (!g) groups.set(code, (g = { vals: [], sum: 0, wSum: 0, wvSum: 0 }));
    g.vals.push(v);
    g.sum += v;
    if (r.w > 0) { g.wSum += r.w; g.wvSum += r.w * v; } // #2951 — a bin's count of readings
  }
  const out = new Map();
  for (const [code, g] of groups) out.set(code, { sorted: Float64Array.from(g.vals).sort(), sum: g.sum, ...(g.wSum > 0 ? { wSum: g.wSum, wvSum: g.wvSum } : {}) });
  return out;
}
// -> [{ key, stats, n, value, nAbove? }] sorted by value, highest first
export function rankLogGroups(grouped, { minN = 3, stat = "median", above = null } = {}) {
  const out = [];
  const thr = Number(above);
  for (const [key, { sorted: s, sum, wSum, wvSum }] of grouped || []) {
    if (!s.length || s.length < minN) continue;
    const stats = { n: s.length, min: s[0], q1: quantileSorted(s, 0.25), median: quantileSorted(s, 0.5), q3: quantileSorted(s, 0.75), max: s[s.length - 1] };
    let value = stats.median, nAbove;
    if (stat === "mean") value = wSum > 0 ? wvSum / wSum : sum / s.length; // #2951 — a binned log's bins weighed by their readings
    else if (stat === "p90") value = quantileSorted(s, 0.9);
    else if (stat === "above" && Number.isFinite(thr)) { nAbove = countAbove(s, thr); value = (100 * nAbove) / s.length; }
    out.push({ key, stats, n: stats.n, value, ...(nAbove != null ? { nAbove } : {}) });
  }
  return out.sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key)));
}

// TASKS.csv #2951 (review #2876, WA iron) — density by strand was a sentence of the top 8 codes, and six were codes of 4 to 214 bins (MNG_U, 9
// bins, first) while TNAM (29,035), HNAM, SONAM, BNAM, CLA and ALU were never printed. Every code's figures for a table: n, the mean (a binned
// log's bins weighed by their count of readings: ONAM's mean of bin means read 3.096 against 3.133 for the readings), median, P10, P90 (of
// the bins), and readings (the readings behind the bins, when known). -> [{ key, n, readings, mean, median, p10, p90, weighted }]
export function codeTable(grouped) {
  const out = [];
  for (const [key, { sorted: s, sum, wSum, wvSum }] of grouped || []) {
    if (!s.length) continue;
    const weighted = wSum > 0;
    out.push({ key, n: s.length, readings: weighted ? wSum : s.length, mean: weighted ? wvSum / wSum : sum / s.length, median: quantileSorted(s, 0.5), p10: quantileSorted(s, 0.1), p90: quantileSorted(s, 0.9), weighted });
  }
  return out;
}

// the log against an assay element: each reading paired with the assay interval of its hole that holds its midpoint
// -> { pairs: [[log, assay]], n, r (Spearman), rLog (Pearson of log10 values), unit, medianRatio, weightedRatio }
// TASKS.csv #2353 — and the ratios a disequilibrium check reads: the median of log / assay, and sum(log x reading length) / sum(assay x reading
// length), over the pairs with an assay above 0 (a correlation says the two move together, not by how much the log under-reads)
// TASKS.csv #2954 (review #2876, WA iron) — perSample: one pair per assay interval, the log's length-weighted mean over the readings inside it,
// instead of a pair per reading (four 0.5 m bins per 2 m sample counted as four independent pairs: 471,063 'pairs' of about 121,000 samples).
// fit: the least-squares line of the log on the element (log = a + b x element: the density-from-iron relation a tonnage needs), with its n.
// TASKS.csv #3078 (follow-up of #2948: an element change at 480,000 readings still took ~1.3 s) — which assay interval holds each reading
// does not depend on the element: assayIndex() finds them once per (log, assay table), and logVsAssayIndexed() reads only the element's
// values through it. logVsAssay() is the two together (the same pairs, in the same order).
// -> { hits: Array(rows.length) of the assay row holding the reading's midpoint (null: none, or no reading), count }
export function assayIndex(rows, symbol, assays) {
  const assayAt = intervalLookup(assays, (a) => a.source !== "pXRF" && Number.isFinite(a.from) && Number.isFinite(a.to)); // #2948 — a binary search, not find
  const hits = new Array((rows || []).length).fill(null);
  let count = 0;
  (rows || []).forEach((r, i) => {
    if (!Number.isFinite(r.values?.[symbol])) return;
    const hit = assayAt(r.hole_id, (r.from + r.to) / 2);
    if (hit) { hits[i] = hit; count++; }
  });
  return { hits, count, rows, symbol };
}
export function logVsAssay(rows, symbol, assays, element, elementUnits = {}, opts = {}) {
  return logVsAssayIndexed(assayIndex(rows, symbol, assays), element, elementUnits, opts);
}
export function logVsAssayIndexed(index, element, elementUnits = {}, { perSample = false } = {}) {
  // #3078 — the pairs in two typed columns (xs: the log, ys: the element), not 480,000 two-element arrays: their allocation and collection were
  // a third of an element change. .pairs is still there ([[log, element]]), built on first use and kept.
  const { rows, symbol, hits } = index;
  const unit = elementUnits[element] || "ppm";
  let xs = new Float64Array(index.count), ys = new Float64Array(index.count), lens = new Float64Array(index.count);
  let n = 0;
  const bySample = perSample ? new Map() : null;
  for (let i = 0; i < rows.length; i++) {
    const hit = hits[i];
    if (!hit) continue;
    const r = rows[i], v = r.values[symbol];
    const g = valueIn(hit, element, unit, elementUnits);
    if (g == null || !Number.isFinite(g)) continue;
    const len = Number.isFinite(r.to - r.from) && r.to > r.from ? r.to - r.from : 1;
    if (bySample) { const e = bySample.get(hit); if (e) { e.sv += v * len; e.sl += len; } else bySample.set(hit, { sv: v * len, sl: len, g }); continue; }
    xs[n] = v; ys[n] = g; lens[n] = len; n++;
  }
  if (bySample) for (const [a, e] of bySample) { xs[n] = e.sv / e.sl; ys[n] = e.g; lens[n] = Number(a.to) - Number(a.from) > 0 ? Number(a.to) - Number(a.from) : e.sl; n++; }
  xs = xs.subarray(0, n); ys = ys.subarray(0, n); lens = lens.subarray(0, n);
  const ratios = new Float64Array(n);
  let k = 0, sl = 0, sa = 0;
  for (let i = 0; i < n; i++) { const a = ys[i]; if (a > 0) { ratios[k++] = xs[i] / a; sl += xs[i] * lens[i]; sa += a * lens[i]; } }
  const sortedRatios = ratios.subarray(0, k).sort(); // #2948 — the typed array's own numeric sort
  const rt = { medianRatio: k ? sortedRatios[k >> 1] : NaN, weightedRatio: sa > 0 ? sl / sa : NaN };
  const out = { xs, ys, n, unit, ...rt, ...(perSample ? { perSample: true } : {}) };
  let pairs = null;
  Object.defineProperty(out, "pairs", { enumerable: true, get() { if (!pairs) { pairs = new Array(n); for (let i = 0; i < n; i++) pairs[i] = [xs[i], ys[i]]; } return pairs; } });
  if (n < 3) return Object.assign(out, { r: NaN, rLog: NaN });
  const cl = correlate(xs, ys, "log"); // #2558 — and how many pairs the log10 Pearson could use, and the plain Pearson
  return Object.assign(out, { r: correlate(xs, ys, "spearman").r, rLog: cl.r, nLog: cl.n, rLin: correlate(xs, ys, "pearson").r, fit: fitLine(ys, xs) }); // fit: #2954 — the log on the element
}

// TASKS.csv #2954 — ordinary least squares y = a + b x -> { a, b, n } (null when x does not vary)
export function fitLine(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx; sxy += dx * (ys[i] - my); sxx += dx * dx; }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, n };
}
// TASKS.csv #2954 — the log / assay ratio (#2353) reads a disequilibrium only when the log and the element are one quantity: an equivalent
// grade from a gamma log (eU, eU3O8, eTh, eK) against the assayed element. A density in g/cc over Fe in % is not a quantity.
const EQUIVALENT = [[/\beu3o8\b|\beu\b|eu3o8|\beu_|equivalent\s*u/i, /^(u|u3o8)$/i], [/\beth\b|eth_|\bethppm|equivalent\s*th/i, /^(th|tho2)$/i], [/\bek\b|ek_|ek%|equivalent\s*k/i, /^(k|k2o)$/i]];
export function ratioComparable(logLabel, element) {
  const s = String(logLabel || ""), el = String(element || "").trim();
  return EQUIVALENT.some(([logRe, elRe]) => logRe.test(s) && elRe.test(el));
}

// TASKS.csv #1595 (review #1497, Lawyers) — a log against a block model evaluated onto the holes ('On holes: <model>', GeophysicsModule
// evaluateOnHoles): each reading paired with the model cell the hole crosses at its midpoint. The reviewer had to do this by hand for
// the MVI amplitude against the 23,575 mag-susc readings (Spearman 0.04 over 1,486 pairs). Spearman is unaffected by the units (a log in
// x10^-3 SI against a model in SI); the medians are each in their own unit. -> { pairs, n, r, rLog, medianLog, medianModel }
export function logVsModel(rows, symbol, modelRows) {
  const cellAt = intervalLookup(modelRows, (m) => Number.isFinite(m.from) && Number.isFinite(m.to) && Number.isFinite(Number(m.value))); // #2948
  const pairs = [];
  for (const r of rows || []) {
    const v = r.values?.[symbol];
    if (!Number.isFinite(v)) continue;
    const hit = cellAt(r.hole_id, (r.from + r.to) / 2);
    if (hit) pairs.push([v, Number(hit.value)]);
  }
  const med = (a) => { if (!a.length) return NaN; const s2 = Float64Array.from(a).sort(), k = Math.floor(s2.length / 2); return s2.length % 2 ? s2[k] : (s2[k - 1] + s2[k]) / 2; };
  if (pairs.length < 3) return { pairs, n: pairs.length, r: NaN, rLog: NaN, medianLog: NaN, medianModel: NaN };
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
  const cl = correlate(xs, ys, "log"); // #2558
  return { pairs, n: pairs.length, r: correlate(xs, ys, "spearman").r, rLog: cl.r, nLog: cl.n, rLin: correlate(xs, ys, "pearson").r, medianLog: med(xs), medianModel: med(ys) };
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

// TASKS.csv #2558 (review #2486) — a log scale suits values that are all above zero and span more than a decade (a resistivity, a mag
// susc); a density contrast, a residual or a derivative is signed, and a log axis dropped its negative half (102 of 564) without a word
export function logScaleSuits(values) {
  let lo = Infinity, hi = -Infinity, n = 0;
  for (const v of values || []) { if (!Number.isFinite(v)) continue; n++; if (v <= 0) return false; if (v < lo) lo = v; if (v > hi) hi = v; }
  return n > 0 && hi / lo > 10;
}
// TASKS.csv #2967 (WA iron review #2876) — the pane's Log list: built-in and imported logs together, the most readings first, a layer's fields
// (its value, '› min', '› max') kept together in their own order. It opened on 'Recovery (3,408)' (a built-in layer, listed first) before
// three wireline logs of 475,849-484,531 bins. sources: numericSourceChoices' entries ({ key, n, layerId | layerKey }). -> a new array
export function orderLogSources(sources) {
  const groupOf = (s) => (s.layerId != null ? `c:${s.layerId}` : `l:${s.layerKey ?? s.key}`);
  const best = new Map(), first = new Map();
  (sources || []).forEach((s, i) => { const g = groupOf(s); best.set(g, Math.max(best.get(g) ?? 0, s.n || 0)); if (!first.has(g)) first.set(g, i); });
  return (sources || []).map((s, i) => ({ s, i, g: groupOf(s) })).sort((a, b) => best.get(b.g) - best.get(a.g) || first.get(a.g) - first.get(b.g) || a.i - b.i).map((x) => x.s);
}
// TASKS.csv #2967 — the scale of one log: the choice kept for THAT log ("log" / "linear"), else automatic. Automatic follows the readings
// (logScaleSuits: all above zero, over a decade) except for the built-in logs the sources call linear (RQD, recovery, SG: #2245). An imported
// log used to be linear whatever its readings (numericSources marks every custom field logScale false). -> { log, auto }
export function logScaleFor(source, values, choice) {
  const auto = choice !== "log" && choice !== "linear";
  if (!auto) return { log: choice === "log", auto: false, autoLog: autoLogScale(source, values) };
  const a = autoLogScale(source, values);
  return { log: a, auto: true, autoLog: a };
}
const autoLogScale = (source, values) => (source?.layerId != null || source?.logScale !== false) && logScaleSuits(values);
export const allAboveZero = (values) => { let n = 0; for (const v of values || []) { if (!Number.isFinite(v)) continue; n++; if (v <= 0) return false; } return n > 0; };
export const countAtOrBelowZero = (values) => (values || []).reduce((k, v) => k + (Number.isFinite(v) && v <= 0 ? 1 : 0), 0);
// a number to three significant figures, small ones included (0.000112, not the 0 that toLocaleString's three decimals gave)
export const sig3 = (v) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumSignificantDigits: 3 }) : "—");

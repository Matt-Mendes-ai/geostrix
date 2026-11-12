// TASKS.csv #2160 (WA drillhole review #2148; Matt's decision 2026-11-09) — downhole geophysical logs: gamma (cps / API), density (g/cc),
// susceptibility (SI), caliper, conductivity / resistivity, eU3O8, at point depths and several channels per file (a LAS goes through las.js
// to the same shape). One numeric layer per channel the user ticks; readings kept raw when they fit the memory budget, above it binned
// (mean, min and max per 0.5 m or 1 m, the user's choice), the bin stated. Pure: no UI.

// a column that names a log channel; and one that is an id / depth / coordinate column (never a channel)
const CHANNEL = /gamma|\bgrs?\b|\bngam|\bcps\b|\bapi\b|densit|\bdens\b|\bsg\b|suscep|\bmsus|\bmag[\s_-]*sus|calip|\bcal\b|conduct|resist|\bres\b|ohm|eu3o8|\beu\b|\bek\b|\bth\b.*ppm|neutron|sonic|velocity|temperat|\bk[\s_-]*%|\bu[\s_-]*ppm/i;
const NOT_CHANNEL = /^(hole|holeid|hole_id|bhid|dhid|site|depth|md|dept|from|to|mfrom|mto|m_from|m_to|depth_from|depth_to|depthstep|depth_step|step|x|y|z|east|north|rl|elev|date|time|comment|remark|tool|run|probe|operator|company|project|priority)$/i; // depthstep: #2884
// TASKS.csv #2329 (review #2325, WA uranium) — "Raw_cps" failed \bcps\b: "_" is a word character. Headers are tested with _ and . as spaces.
const spaced = (h) => String(h ?? "").replace(/[_.]+/g, " ");
const isChannel = (h) => CHANNEL.test(spaced(h));
// a channel only a downhole log has (an interval table with one of these is a log at short steps, not a lithology / assay table)
const LOG_ONLY = /gamma|\bgrs?\b|\bngam|\bcps\b|\bapi\b|eu3o8|neutron|calip|conduct|resist|ohm/i;
const isLogOnly = (h) => LOG_ONLY.test(spaced(h));
const FROM_TO = /^(from|to|depth_?from|depth_?to|geolfrom|geolto|sampfrom|sampto|m_?from|m_?to)$/i;
// TASKS.csv #2884 (review #2876, WA iron) — headers are tested with spaces as "_": "Depth From" / "Depth To" (every WAMEX export) matched
// nothing, so the 121 MB density / gamma / susceptibility log was guessed as a Specific gravity interval layer of 2.48 M zero-length rows.
const under = (h) => String(h ?? "").trim().replace(/\s+/g, "_");
const isFromTo = (h) => FROM_TO.test(under(h));
// #2884 — the From and To columns of the headers, and whether From equals To on (nearly) every sampled row: point readings, whatever the
// headers say. At most 500 rows, spread through the table; null when fewer than 10 rows have both numbers.
export function zeroLengthRows(headers, rows, sample = 500) {
  const hs = (headers || []).map((h) => String(h));
  const f = hs.find((h) => isFromTo(h) && /from$/i.test(under(h))), t = hs.find((h) => isFromTo(h) && /to$/i.test(under(h)));
  if (!f || !t || !rows?.length) return null;
  const step = Math.max(1, Math.floor(rows.length / sample));
  let n = 0, same = 0;
  for (let i = 0; i < rows.length && n < sample; i += step) {
    const a = toNum(rows[i]?.[f]), b = toNum(rows[i]?.[t]);
    if (rows[i]?.[f] === "" || rows[i]?.[t] === "" || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    n++; if (Math.abs(a - b) < 1e-9) same++;
  }
  return n >= 10 ? same / n >= 0.95 : null;
}
// the unit a header names: "Density_Best (g/cc)", "Gamma_cps", "Suscep_SI", "eU3O8_cased_ppm", "RES_ohmm"
const UNITS = [
  [/\bcps\b|_cps\b|counts?[\s_]*per[\s_]*sec/i, "cps"], [/\bapi\b|_api\b/i, "API"], [/g\s*\/\s*cc|g\/cm3|g\s*cm-?3|\bgcc\b|_gcc\b/i, "g/cc"],
  [/\bsi\b|_si\b|x\s*10-?3|e-?3\s*si/i, "SI"], [/ppm/i, "ppm"], [/ohm[\s.-]*m|ohmm|_ohm/i, "ohm.m"], [/ms\s*\/\s*m|mmho|_msm\b/i, "mS/m"],
  [/\bmm\b|_mm\b/i, "mm"], [/\bin\b|inch/i, "in"], [/%|pct|percent/i, "%"], [/deg\s*c|°c|_degc/i, "°C"], [/us\s*\/\s*(ft|m)/i, "µs/m"],
];
export function unitFromHeader(h) {
  const s = String(h ?? "");
  const par = /\(([^)]+)\)|\[([^\]]+)\]/.exec(s);
  if (par) { const u = (par[1] || par[2]).trim(); if (u && u.length <= 12) return u; }
  for (const [re, u] of UNITS) if (re.test(s)) return u;
  return "";
}
// TASKS.csv #2885 — a cell as a number, as Number(String(v).replace(",", ".")) gave it (blank / null -> 0) but without a new string per cell:
// a string is read with + first and the comma decimal is tried only when that fails. The WA iron log (2.58 M rows x 5 numeric cells) spent
// most of its binning here.
function toNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const x = +v; return x === x ? x : Number(v.replace(",", ".")); }
  return Number(String(v ?? "").replace(",", "."));
}
const isNum = (v) => v != null && v !== "" && Number.isFinite(toNum(v));
// the columns of a point-depth table that hold numeric readings (the hole and depth columns left out): [{ col, unit, named }] —
// named: the header names a known log channel (pre-ticked); other numeric columns are offered unticked
export function logChannelColumns(headers, rows, mapping = {}, sample = 200) {
  const skip = new Set([mapping.hole_id, mapping.depth, mapping.from, mapping.to, mapping.x, mapping.y, mapping.z].filter(Boolean));
  const out = [];
  for (const h of headers || []) {
    if (skip.has(h) || NOT_CHANNEL.test(String(h).trim().replace(/\s+/g, "_"))) continue;
    let seen = 0, nums = 0;
    for (const r of rows || []) { const v = r?.[h]; if (v == null || v === "") continue; seen++; if (isNum(v)) nums++; if (seen >= sample) break; }
    if (!seen || nums / seen < 0.8) continue;
    out.push({ col: h, unit: unitFromHeader(h), named: isChannel(h) }); // #2329 — Raw_cps
  }
  return out;
}
// a table that is a downhole log rather than an SG / lithology / mag-susc layer: point depths, and two or more channel columns, or one that
// only a log has (gamma, cps, API, eU3O8, caliper, conductivity / resistivity). #2329 — also a From / To table at short steps (the WA
// 5 cm gamma log: Hole_ID, mFrom, mTo, Raw_cps, eU3O8_cased_ppm) when a column only a log has is present: read at each interval's middle.
// rows (optional, #2884): an interval table whose From equals To on every sampled row is a log with any named channel (density alone too)
export function looksLikeLogTable(headers, rows = null) {
  const hs = (headers || []).map((h) => String(h));
  const named = hs.filter((h) => isChannel(h) && !NOT_CHANNEL.test(under(h)));
  if (!named.length) return false;
  if (hs.some((h) => /^alpha/i.test(h.trim())) && hs.some((h) => /^beta/i.test(h.trim()))) return false; // oriented core: its 'Gamma' is an angle (#604's Woodjam event log)
  if (hs.some(isFromTo)) return named.some(isLogOnly) || zeroLengthRows(hs, rows) === true; // #2329 — an interval table is a log only with a log-only channel; #2884 — or point readings
  if (!hs.some((h) => /^(depth|md|dept|depth_?m|depth_?\(m\)|depth_?metres?|sampdepth)$/i.test(h.trim().replace(/\s+/g, "_")))) return false;
  return named.length >= 2 || named.some(isLogOnly);
}
// #2329 — a reading's depth: the depth column, else the middle of its From / To
export function readingDepth(r, mapping) {
  if (mapping?.depth) return toNum(r?.[mapping.depth]);
  if (mapping?.from && mapping?.to) { const f = toNum(r?.[mapping.from]), t = toNum(r?.[mapping.to]); return Number.isFinite(f) && Number.isFinite(t) ? (f + t) / 2 : NaN; }
  return NaN;
}

// TASKS.csv #2332 (review #2325, WA uranium) — no-data codes in a log channel: eU3O8 of -1 (545 rows) and -1.83E+09 (10 rows), Raw_cps of
// 10.7 million beside a maximum of 54,938, went in as readings (the layer's mean -41,600 ppm). A value is questioned when it is one of the
// usual null sentinels, negative in a unit that cannot be (ppm, cps, g/cc, %, API, ohm.m, mS/m, mm, in), or more than 1,000 times the
// channel's own 99th percentile either way (-1.83E+09 in a channel of unknown unit too). -> { n, codes: [[value, count]], values: Set } | null
const SENTINELS = new Set([-999, -999.25, -9999, -99999, -999999]);
const NON_NEGATIVE_UNITS = new Set(["ppm", "cps", "g/cc", "%", "API", "ohm.m", "mS/m", "mm", "in"]);
export function channelNoData(rows, col, unit = "") {
  const vals = [];
  for (const r of rows || []) { const v = r?.[col]; if (isNum(v)) vals.push(toNum(v)); }
  if (!vals.length) return null;
  // the 99th percentile of the positive readings, from at most 20,000 of them spread through the file
  const pos = vals.filter((v) => v > 0), step = Math.max(1, Math.floor(pos.length / 20000)), sample = [];
  for (let i = 0; i < pos.length; i += step) sample.push(pos[i]);
  sample.sort((a, b) => a - b);
  const p99 = sample.length ? sample[Math.min(sample.length - 1, Math.floor(0.99 * (sample.length - 1)))] : null;
  const noNeg = NON_NEGATIVE_UNITS.has(unit), codes = new Map();
  for (const v of vals) if (SENTINELS.has(v) || (noNeg && v < 0) || (p99 > 0 && Math.abs(v) > 1000 * p99)) codes.set(v, (codes.get(v) || 0) + 1);
  if (!codes.size) return null;
  let n = 0; for (const c of codes.values()) n += c;
  return { n, codes: [...codes].sort((a, b) => b[1] - a[1]), values: new Set(codes.keys()) };
}
// "-1 × 545, -1.83E+09 × 10" (the first few)
export const noDataText = (nd, k = 4) => nd.codes.slice(0, k).map(([v, c]) => `${Math.abs(v) >= 1e6 ? v.toExponential(2).toUpperCase().replace("E+", "E+0").replace(/E\+0(\d\d)/, "E+$1") : v} × ${c}`).join(", ") + (nd.codes.length > k ? ", …" : "");

// TASKS.csv #2160 — readings kept raw while the layers stay under this many values in all; above it binning is offered (decision (2))
// TASKS.csv #2430 (review #2325, WA uranium) — was 1,000,000: two channels of a 439,780-reading log (879,560 values) stayed under it, so the
// default import kept every reading: one 3.7 s freeze and 98 -> 937 MB of heap. 200,000 values pre-selects 0.5 m bins on such a log.
export const LOG_RAW_BUDGET = 200_000;
export const needsBinning = (readings, channels) => readings * Math.max(1, channels) > LOG_RAW_BUDGET;
// #2430 — what every reading costs in memory once committed: the review measured about 420 MB of heap per 439,780-reading channel, i.e.
// close to 1 KB a value (one point row each). An estimate for the dialog's text, rounded to 10 MB; never below 10.
export const LOG_BYTES_PER_VALUE = 1000;
export const rawLogMB = (readings, channels) => Math.max(10, Math.round((readings * Math.max(1, channels) * LOG_BYTES_PER_VALUE) / 1e7) * 10);
// TASKS.csv #2885 (review #2876, WA iron) — the bins offered. 0.5 m bins cut the 2.58 M readings of a 6,292-hole log only to about 480,000
// rows a channel (seven times the budget): one 23.8 s freeze, 2.4 GB of heap, and a 29 s reopen. Coarser bins are offered, each with the
// rows it leaves, and the smallest that fits the budget is pre-selected.
export const LOG_BINS = [0.5, 1, 2, 5];
// the rows each bin leaves per channel, from one pass over the readings: per hole, the bins between its shallowest and deepest reading
// (an upper bound: a gap in the readings leaves empty bins out). -> { readings, holes, bins: [{ binM, rows }] }
// Kept per table (the rows array) and mapping, so the dialog's renders and the commit read it once.
const estCache = new WeakMap();
export function logBinEstimate(rows, mapping, bins = LOG_BINS) {
  const key = [mapping?.hole_id, mapping?.depth, mapping?.from, mapping?.to, ...bins].join("\u0001");
  const cached = Array.isArray(rows) ? estCache.get(rows) : null;
  if (cached?.key === key) return cached.est;
  const est = binEstimate(rows, mapping, bins);
  if (Array.isArray(rows)) estCache.set(rows, { key, est });
  return est;
}
function binEstimate(rows, mapping, bins) {
  const span = new Map();
  let readings = 0;
  for (const r of rows || []) {
    const hole = r?.[mapping?.hole_id];
    if (hole == null || hole === "") continue;
    const d = readingDepth(r, mapping);
    if (!Number.isFinite(d)) continue;
    readings++;
    const s = span.get(hole);
    if (!s) span.set(hole, [d, d]); else { if (d < s[0]) s[0] = d; if (d > s[1]) s[1] = d; }
  }
  return {
    readings, holes: span.size,
    bins: bins.map((binM) => { let n = 0; for (const [a, b] of span.values()) n += Math.floor(b / binM + 1e-9) - Math.floor(a / binM + 1e-9) + 1; return { binM, rows: n }; }),
  };
}
// #2885 — the bin that fits: the smallest offered whose rows x channels stay under the budget, else the coarsest
export function fittingLogBin(est, channels) {
  const k = Math.max(1, channels), list = est?.bins || [];
  if (!list.length) return LOG_BINS[0];
  return (list.find((b) => b.rows * k <= LOG_RAW_BUDGET) || list[list.length - 1]).binM;
}

// one channel's layer rows. binM null: a row per reading { hole_id, depth, value }; binM > 0: per hole, per bin [k*binM, (k+1)*binM):
// { hole_id, from, to, value (mean), min, max, n }. Readings with no number are left out (counted in skipped).
// drop (#2332): a Set of values left out as no-data codes (counted in dropped)
export function logChannelRows(rows, mapping, col, binM = null, drop = null) {
  const pts = [], binned = binM > 0;
  // TASKS.csv #2885 — binned, the readings go straight into their bins (per hole, by bin number): no object per reading and no string key
  // per reading, which made most of the 23.8 s freeze on the 2.58 M-reading WA iron log
  const byHole = binned ? new Map() : null;
  let skipped = 0, dropped = 0, readings = 0;
  for (const r of rows || []) {
    const hole = String(r?.[mapping.hole_id] ?? "").trim(), d = readingDepth(r, mapping), v = r?.[col]; // #2329 — or the From / To middle
    if (!hole || !Number.isFinite(d) || !isNum(v)) { skipped++; continue; }
    const x = toNum(v);
    if (drop && drop.has(x)) { dropped++; continue; } // #2332
    if (!binned) { pts.push({ hole_id: hole, depth: d, value: x }); continue; }
    readings++;
    const k = Math.floor(d / binM + 1e-9);
    let hm = byHole.get(hole);
    if (!hm) byHole.set(hole, (hm = new Map()));
    let b = hm.get(k);
    if (!b) hm.set(k, (b = { sum: 0, n: 0, min: Infinity, max: -Infinity }));
    b.sum += x; b.n++; if (x < b.min) b.min = x; if (x > b.max) b.max = x;
  }
  if (!binned) return { rows: pts, skipped, dropped, binned: false };
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const out = [];
  for (const hole of [...byHole.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const hm = byHole.get(hole);
    for (const k of [...hm.keys()].sort((a, b) => a - b)) { const b = hm.get(k); out.push({ hole_id: hole, from: r4(k * binM), to: r4((k + 1) * binM), value: b.sum / b.n, min: b.min, max: b.max, n: b.n }); }
  }
  return { rows: out, skipped, dropped, binned: true, readings };
}
// the channels ticked when the dialog opens: the columns named as log channels (null: none named, the one-layer path as before)
export function defaultLogChannels(channels) {
  const named = (channels || []).filter((c) => c.named).map((c) => c.col);
  return named.length ? named : null;
}
// the bin offered by default: none (raw) when the readings fit; else 0.5 m, or with est (#2885, logBinEstimate) the smallest bin that fits
export const defaultLogBin = (readings, channels, est = null) => (needsBinning(readings, channels) ? (est ? fittingLogBin(est, channels) : 0.5) : null);
// TASKS.csv #2333 (review #2325, WA uranium) — the bin is the user's only once they pick it in the bin menu; until then it follows the ticked
// channels. The box wrote the then-current default (every reading) on the first tick, so ticking a 2nd and 3rd channel on a 439,225-reading
// log left 'Every reading (no bins)' selected under a note saying the readings would be averaged, and the import would have kept 1.3 M.
export const effectiveLogBin = (modal, readings, channels, est = null) => (modal.logBinM !== undefined ? modal.logBinM : defaultLogBin(readings, channels, est)); // est: #2885
// the modal after a change in the box: the ticked channels, and the patch (a bin only when the patch carries one)
export const logBoxPatch = (modal, ticked, patch) => ({ ...modal, logChannels: ticked, ...patch });
// the channels an import will make layers of: the user's choice, else the named ones; null when this is not a point-depth custom layer
// (the dialog, its required-field check and the commit all ask this one function)
export function logChannelsFor(target, headers, rows, mapping, chosen) {
  if (target !== "custom") return null;
  const point = mapping?.depth && !mapping?.from, interval = !mapping?.depth && mapping?.from && mapping?.to; // interval: #2329 — read at the middles
  if (!point && !(interval && looksLikeLogTable(headers, rows))) return null; // rows: #2884
  const list = chosen ?? defaultLogChannels(logChannelColumns(headers, rows, mapping));
  return list?.length ? list : null;
}

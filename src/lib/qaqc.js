// TASKS.csv #134 — Micromine-specialist audit finding: "Beyond dataQC.js's thorough geometric QC
// (overlaps, gaps, azimuth/dip sanity), there's nothing tracking lab QC inserts — standard recovery
// vs. certified value, blank contamination, duplicate-pair precision (HARD/CRM charts). Core to
// defensible resource work and NI 43-101/JORC compliance, and a distinct concern from the geometric
// QC already built." This is that distinct concern: lab/analytical QAQC, not drillhole geometry.
//
// GeoStrix has no external CRM-certificate database (no per-standard certified value + published SD
// to compare against), so standards are tracked via a SELF-REFERENCING control chart instead — mean
// and stdev of that same standard's own repeat insertions across the project, same practical approach
// many juniors use before/without a formal certificate on file. This still catches the two things a
// control chart is actually for: a standard drifting or a single bad batch, both visible as points
// outside the 2SD/3SD band — just without an externally-certified "true" value to anchor to. Blanks
// and duplicates need no such reference at all (a blank should read near-zero regardless; a duplicate
// pair is compared to itself), so those ARE absolute, not just self-referencing.
//
// QAQC samples are identified purely by hole_id naming convention — the common lab practice of
// inserting QC samples into the sample stream under a distinguishing ID (e.g. "STD-OREAS622",
// "BLANK-07", "OR-26-01-DUP") rather than a separate "sample type" column GeoStrix doesn't have
// anywhere in its assay import schema. Patterns are deliberately simple substring matches (not a
// prescribed lab format) and exposed as an argument so a project whose lab uses different conventions
// isn't stuck with these defaults.
import { valueIn } from "./geochem.js";

export const DEFAULT_QAQC_PATTERNS = {
  standard: ["std", "crm", "oreas", "standard", "gbm", "sy-", "sy_"],
  blank: ["blank", "blk"],
  duplicate: ["dup", "-d2", "fdup", "duplicate"],
};

// TASKS.csv #400 / #601 — the sample-type rules and the registered collar ids live in qaqcCore.js, which the store and the 3D view
// load at startup; the rest of this file (control charts, duplicates, exclusion) loads with the panels that use it (#1345: 18 kB).
import { sampleTypeClass, knownHoleIds } from "./qaqcCore.js";
export { setKnownHoleIds, isMarkedQcRow, sampleTypeClass } from "./qaqcCore.js";

// Order matters: blank and duplicate markers are checked before standard, since they're the more
// specific/unambiguous signals — a hole_id can't simultaneously BE a blank and a standard, but
// nothing stops an unlucky standard name from containing a duplicate-like substring by coincidence.
// Accepts an assay ROW (preferred: sample_type is used) or a bare hole_id string (older callers).
export function classifyQAQCRow(rowOrId, patterns = DEFAULT_QAQC_PATTERNS, knownHoles = knownHoleIds()) {
  const row = rowOrId && typeof rowOrId === "object" ? rowOrId : { hole_id: rowOrId };
  const byType = sampleTypeClass(row.sample_type);
  if (byType) return byType;
  if (knownHoles && knownHoles.has(row.hole_id)) return "regular";
  const id = (row.hole_id || "").toLowerCase();
  if (patterns.blank.some((p) => id.includes(p))) return "blank";
  if (patterns.duplicate.some((p) => id.includes(p))) return "duplicate";
  if (patterns.standard.some((p) => id.includes(p))) return "standard";
  return "regular";
}

// Sample statistics for a standard's own repeat measurements — same n-1 convention as
// GradeStatistics.jsx's computeStats, for consistency across the app's stats displays.
export function controlLimits(values) {
  const n = values.length;
  if (!n) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, ucl2: mean + 2 * sd, lcl2: mean - 2 * sd, ucl3: mean + 3 * sd, lcl3: mean - 3 * sd };
}

// TASKS.csv #219 (Micromine/mineral-exploration-specialist audit finding) — QAQC samples (standards/
// blanks/duplicates) were flowing straight into Best-Intercepts/Compositing/Grade-Statistics as if
// they were real assay results, since none of those consulted classifyQAQCRow at all — a synthetic
// standard could turn up as a "best intercept" alongside real drillhole intervals. Every report that
// shouldn't be diluted/skewed by a QC insert can call this once instead of re-deriving the same filter.
// TASKS.csv #1673 / #1674 (review #1645, Copley) — pXRF readings are not lab grades: they were averaged into Grade stats, intercepts,
// correlations and classifications beside the lab assays (Copley: Spearman Cu-Mo 0.56 lab-only, 0.38 mixed; Pearson Rb-Sr 1.00 from one
// bad reading). They are kept out of every grade tool, whatever its QC toggle says; the dialogs say how many were left out.
export const isPxrfRow = (a) => a?.source === "pXRF";
// TASKS.csv #1579 — the same input array gives the same output array (default patterns), so the statistics cached per assay list
// (geochem.js segmentSummary) are found again when a dialog reopens; the callers read these lists, never change them
const labCache = new WeakMap(), regularCache = new WeakMap();
export const labAssays = (assays) => {
  if (!assays) return [];
  let r = labCache.get(assays);
  if (!r) labCache.set(assays, (r = assays.filter((a) => !isPxrfRow(a))));
  return r;
};
export function excludeQAQC(assays, patterns = DEFAULT_QAQC_PATTERNS) {
  const cache = patterns === DEFAULT_QAQC_PATTERNS ? regularCache : null;
  let r = cache?.get(assays);
  if (!r) { r = assays.filter((a) => !isPxrfRow(a) && a.excluded !== "total" && classifyQAQCRow(a, patterns) === "regular"); cache?.set(assays, r); } // excluded: #2506 (QAQC > Totals)
  return r;
}

// TASKS.csv #400 — what is being left out, and why, so an exclusion is never silent: distinct ids per class.
export function excludedQAQCIds(assays, patterns = DEFAULT_QAQC_PATTERNS) {
  const out = { standard: new Map(), blank: new Map(), duplicate: new Map(), total: new Map() }; // total: #2506 — excluded in QAQC > Totals
  assays.forEach((a) => {
    const c0 = classifyQAQCRow(a, patterns);
    const c = c0 === "regular" && a.excluded === "total" ? "total" : c0;
    if (c === "regular") return;
    const why = c === "total" ? "oxide total" : sampleTypeClass(a.sample_type) ? "sample type" : "name";
    const k = a.hole_id || "(no id)";
    const e = out[c].get(k) || { id: k, rows: 0, why };
    e.rows++; out[c].set(k, e);
  });
  return Object.fromEntries(Object.entries(out).map(([c, m]) => [c, [...m.values()]]));
}

// Groups every "standard"-classified assay row by its own exact hole_id (real labs commonly reuse
// the identical insert ID, e.g. "OREAS622", across many batches — that repetition IS the population
// a control chart is built from). Groups with fewer than 2 occurrences are dropped — nothing to chart.
export function standardGroups(assays, patterns = DEFAULT_QAQC_PATTERNS) {
  const byId = new Map();
  assays.forEach((a) => {
    if (classifyQAQCRow(a, patterns) !== "standard") return;
    // TASKS.csv #400 — lab exports keep a standard under the REAL hole_id and name the CRM in its own
    // column (qc_code); grouping by hole_id there would mix different CRMs into one chart.
    const k = a.qc_code || a.hole_id;
    if (!byId.has(k)) byId.set(k, []);
    byId.get(k).push(a);
  });
  return Array.from(byId.entries()).filter(([, rows]) => rows.length >= 2).map(([id, rows]) => ({ id, rows }));
}

// One standard group's measurements for a given element, in insertion order, with control limits
// computed from that same series (self-referencing, see header comment) and each point flagged
// against the 2SD/3SD bands.
// TASKS.csv #400 — `certified` {mean, sd} (from the CRM's certificate, entered by the user) replaces the
// self-referencing limits: a standard that reads consistently 8% high is IN control against its own
// scatter but badly biased against its certified value — only the certificate shows that. The observed
// mean / SD and the bias (%) are returned either way.
export function standardSeries(rows, symbol, elementUnits, certified = null) {
  const points = rows.map((r, i) => ({ i, hole_id: r.hole_id, from: r.from, to: r.to, value: valueIn(r, symbol, elementUnits[symbol] || "ppm", elementUnits) })).filter((p) => p.value != null);
  const values = points.map((p) => p.value);
  const observed = controlLimits(values);
  if (!observed) return { points: [], limits: null };
  const cert = certified && Number.isFinite(certified.mean) && Number.isFinite(certified.sd) && certified.sd > 0 ? certified : null;
  const limits = cert
    ? { n: observed.n, mean: cert.mean, sd: cert.sd, ucl2: cert.mean + 2 * cert.sd, lcl2: cert.mean - 2 * cert.sd, ucl3: cert.mean + 3 * cert.sd, lcl3: cert.mean - 3 * cert.sd, certified: true }
    : { ...observed, certified: false };
  const flagged = points.map((p) => ({ ...p, outside2sd: p.value > limits.ucl2 || p.value < limits.lcl2, outside3sd: p.value > limits.ucl3 || p.value < limits.lcl3 }));
  const biasPct = cert && cert.mean !== 0 ? ((observed.mean - cert.mean) / cert.mean) * 100 : null;
  return { points: flagged, limits, observed, biasPct };
}

// Blank rows for a given element, flagged against `threshold` (an absolute value in the element's
// display unit — e.g. 0.05 ppm Au — since there's no universal "5x detection limit" GeoStrix can
// derive automatically without a detection-limit field in the assay schema, which it doesn't have).
export function blankRows(assays, symbol, elementUnits, threshold, patterns = DEFAULT_QAQC_PATTERNS) {
  return assays.filter((a) => classifyQAQCRow(a, patterns) === "blank") // #400: the row (sample_type), not just the name
    .map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, value: valueIn(a, symbol, elementUnits[symbol] || "ppm", elementUnits) }))
    .filter((r) => r.value != null)
    .map((r) => ({ ...r, flagged: threshold != null && r.value > threshold }));
}

// Strips a recognized duplicate marker substring out of a hole_id to recover the original sample's
// own hole_id (e.g. "OR-26-01-DUP" -> "OR-26-01"), so a duplicate row can be matched back to its
// original by hole_id + interval. Falls back to the untouched hole_id if no marker matched (caller
// then just won't find a pairing, which is the correct outcome for an unrecognized naming scheme).
function stripDuplicateMarker(hole_id, patterns) {
  const id = hole_id || "";
  for (const p of patterns.duplicate) {
    const idx = id.toLowerCase().indexOf(p);
    if (idx === -1) continue;
    return (id.slice(0, idx) + id.slice(idx + p.length)).replace(/[-_]+$/, "").replace(/^[-_]+/, "").trim();
  }
  return id;
}

// Matches each "duplicate"-classified row to a "regular" row sharing the same (stripped) hole_id and
// EXACT from/to — the common case for a lab (pulp/reject) duplicate re-run on the same interval. A
// field duplicate taken as a genuinely separate sample at a slightly different depth won't match this
// way; that's an accepted first-pass limitation (see TASKS.csv #134's own notes), not a silent bug —
// it simply won't appear as a pair rather than being force-matched to the wrong interval.
// TASKS.csv #400 — pairing, in order: (1) the duplicate's parent_id = an original's sample_id (acQuire / MX
// exports); (2) a regular row at the same hole_id + interval (a duplicate marked by sample_type under the
// real hole_id); (3) the old name convention (strip "DUP" from the id). `minMean` drops pairs whose mean
// is below it (RPD near the detection limit is noise — typically set to ~10x the detection limit): they
// are returned with belowLimit: true so the table can show them greyed, and are left out of `summary`.
// TASKS.csv #579 — repeatedIntervals: legacy / ARIS exports (Harry among them: 159 pairs) carry a duplicate as a
// SECOND ROW for the same hole and interval under the real hole_id, with no sample-type column, so nothing marks
// it as QC. With this on, the first regular row of an interval is the original and each later one with a
// different result is its duplicate ("repeated interval", type not stated). A later row whose values are all
// identical is a double import, not a re-assay (an RPD of 0 would flatter the precision): it is skipped and
// counted in pairs.identicalRepeats.
export function duplicatePairs(assays, symbol, elementUnits, patterns = DEFAULT_QAQC_PATTERNS, { minMean = 0, repeatedIntervals = false } = {}) {
  const originals = new Map(), bySampleId = new Map(), repeats = [];
  assays.forEach((a) => {
    if (classifyQAQCRow(a, patterns) !== "regular") return;
    const k = `${a.hole_id}|${a.from}|${a.to}`;
    if (!originals.has(k)) originals.set(k, a); // the FIRST row of an interval is its original (#579)
    else if (repeatedIntervals) repeats.push(a);
    if (a.sample_id) bySampleId.set(String(a.sample_id), a);
  });
  const pairs = [];
  let identicalRepeats = 0;
  assays.forEach((a) => {
    if (classifyQAQCRow(a, patterns) !== "duplicate") return;
    let orig = null, how = "";
    if (a.parent_id && bySampleId.has(String(a.parent_id))) { orig = bySampleId.get(String(a.parent_id)); how = "parent id"; }
    else if (originals.has(`${a.hole_id}|${a.from}|${a.to}`)) { orig = originals.get(`${a.hole_id}|${a.from}|${a.to}`); how = "same interval"; }
    else { orig = originals.get(`${stripDuplicateMarker(a.hole_id, patterns)}|${a.from}|${a.to}`) || null; how = "name"; }
    if (!orig) return;
    // TASKS.csv #2629 — a lab repeat of one method (Au2_100) pairs with the original's result by that method (Au_100) when the row
    // kept it, else with the element's value; an original whose only result is in a method column (not joined) pairs with it too
    const m = originalMethodValue(orig, a, symbol);
    const v1 = m ? m.value : valueIn(orig, symbol, elementUnits[symbol] || "ppm", elementUnits);
    if (m) how = `${how}, ${m.header}`;
    const v2 = valueIn(a, symbol, elementUnits[symbol] || "ppm", elementUnits);
    if (v1 == null || v2 == null) return;
    const mean = (v1 + v2) / 2;
    const rpd = mean !== 0 ? (Math.abs(v1 - v2) / mean) * 100 : 0;
    pairs.push({ original_hole: orig.hole_id, duplicate_hole: a.hole_id, from: a.from, to: a.to, v1, v2, rpd, how, belowLimit: minMean > 0 && mean < minMean, kind: duplicateKind(a), sample_id: a.sample_id ?? null });
  });
  repeats.forEach((a) => { // #579
    const orig = originals.get(`${a.hole_id}|${a.from}|${a.to}`);
    if (JSON.stringify(orig.values ?? null) === JSON.stringify(a.values ?? null)) { identicalRepeats++; return; }
    const v1 = valueIn(orig, symbol, elementUnits[symbol] || "ppm", elementUnits);
    const v2 = valueIn(a, symbol, elementUnits[symbol] || "ppm", elementUnits);
    if (v1 == null || v2 == null) return;
    const mean = (v1 + v2) / 2;
    const rpd = mean !== 0 ? (Math.abs(v1 - v2) / mean) * 100 : 0;
    pairs.push({ original_hole: orig.hole_id, duplicate_hole: a.hole_id, from: a.from, to: a.to, v1, v2, rpd, how: "repeated interval", belowLimit: minMean > 0 && mean < minMean, kind: duplicateKind(a), sample_id: a.sample_id ?? null });
  });
  pairs.identicalRepeats = identicalRepeats;
  return pairs;
}

// TASKS.csv #2629 — the lab method of a column: its trailing _<digits> ('U_103' -> '103', 'Au2_100' -> '100'), else null
export const methodSuffix = (header) => { const m = /_(\d+)$/.exec(String(header ?? "").replace(/\(.*?\)/g, "").trim()); return m ? m[1] : null; };
// The original's result to compare a repeat with, from the method columns kept on its row (#2629): the column of the repeat's own
// method when there is one; else, when the original has no value of the element, its only kept method result. -> { header, value } | null
export function originalMethodValue(orig, rep, symbol) {
  const mv = orig?.methodValues?.[symbol];
  if (!mv) return null;
  const entries = Object.entries(mv).filter(([, v]) => Number.isFinite(v));
  if (!entries.length) return null;
  const suf = methodSuffix(rep?.repeatColumn);
  if (suf) { const hit = entries.find(([h]) => methodSuffix(h) === suf); if (hit) return { header: hit[0], value: hit[1] }; }
  if (orig.values?.[symbol] == null && entries.length === 1) return { header: entries[0][0], value: entries[0][1] };
  return null;
}

// TASKS.csv #2629 (split from #2350, review #2325 WA uranium) — two lab methods of one element on the same samples (U and U_103: 41 core
// samples; V and V_101: 36, a 1.78 ratio) were invisible once the import joined or dropped the second column. The import keeps the other
// methods' results on the row (methodValues, in the element's unit); here each method column is paired with the element's own value on
// the regular samples that carry both. Censored ('<' / '>') element values are left out. ratio = method / element.
// -> [{ header, base, n, medianRpd, medianRatio, pairs: [{ hole_id, from, to, sample_id, v1, v2, rpd }] }], most pairs first
export function methodPairs(assays, symbol, patterns = DEFAULT_QAQC_PATTERNS) {
  const by = new Map();
  for (const a of assays || []) {
    const mv = a?.methodValues?.[symbol];
    if (!mv) continue;
    const v1 = a.values?.[symbol];
    if (v1 == null || !Number.isFinite(v1) || a.qualifiers?.[symbol]) continue;
    if (classifyQAQCRow(a, patterns) !== "regular") continue;
    const base = a.valueSources?.[symbol] || "";
    for (const [header, v2] of Object.entries(mv)) {
      if (!Number.isFinite(v2)) continue;
      const k = `${header}|${base}`;
      let g = by.get(k);
      if (!g) by.set(k, (g = { header, base, pairs: [] }));
      const mean = (v1 + v2) / 2;
      g.pairs.push({ hole_id: a.hole_id, from: a.from, to: a.to, sample_id: a.sample_id ?? null, v1, v2, rpd: mean !== 0 ? (Math.abs(v1 - v2) / mean) * 100 : 0 });
    }
  }
  const med = (xs) => { const s = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  return [...by.values()].map((g) => ({ ...g, n: g.pairs.length, medianRpd: med(g.pairs.map((p) => p.rpd)), medianRatio: med(g.pairs.filter((p) => p.v1 > 0).map((p) => p.v2 / p.v1)) })).sort((x, y) => y.n - x.n);
}

// share of the counted pairs (not below the limit) within their RPD limit. `limits` is one number for every pair (the
// old behaviour) or a per-kind table (TASKS.csv #534: DUP_RPD_LIMITS), with a per-kind breakdown.
export function duplicateSummary(pairs, limits = 20) {
  const limitOf = (p) => (typeof limits === "number" ? limits : limits[p.kind] ?? limits.unknown ?? 20);
  const used = pairs.filter((p) => !p.belowLimit);
  const within = used.filter((p) => p.rpd <= limitOf(p)).length;
  const byKind = {};
  used.forEach((p) => { const k = p.kind || "unknown"; const b = byKind[k] || (byKind[k] = { used: 0, within: 0, limit: limitOf(p) }); b.used++; if (p.rpd <= limitOf(p)) b.within++; });
  return { used: used.length, below: pairs.length - used.length, within, pctWithin: used.length ? (100 * within) / used.length : null, byKind };
}

// ---------- TASKS.csv #534 — limits that suit the element and the duplicate type ----------
// Usual precision limits differ by how far down the preparation chain the duplicate was split: a field (core) duplicate
// carries the geological and sampling variance (~30% RPD), a coarse reject the preparation variance (~20%), a pulp only
// the analytical (~10%). The kind is read from the sample-type / QC-code text; unrecognised types keep the old 20%.
export const DUP_RPD_LIMITS = { field: 30, coarse: 20, pulp: 10, unknown: 20 };
export const DUP_KIND_LABELS = { field: "field", coarse: "coarse reject", pulp: "pulp", unknown: "type not stated" };
export function duplicateKind(row) {
  const t = `${row?.sample_type ?? ""} ${row?.qc_code ?? ""}`.toLowerCase();
  if (/pulp|lab\s*(rep|dup)|repeat|replicate|^pd\b/.test(t)) return "pulp";
  if (/coarse|reject|crush|prep|^c(r)?d\b/.test(t)) return "coarse";
  if (/field|quarter|half|core|twin|rig|^fd\b/.test(t)) return "field";
  return "unknown";
}
// The lab's detection limit for an element, from the data: a '<x' result is stored at x/2 with qualifier '<', so the
// most common doubled value among those IS the reported limit ({ basis: "lt" }); with none, the lowest positive value
// is an upper bound on it ({ basis: "min" }). In the element's own unit. { limit: null } when nothing is assayed.
// TASKS.csv #1520 (review #1497, Lawyers) — a censoring floor: half-detection-limit values already substituted in the source file sit
// on one repeated minimum (Au 0.0005 ppm: 20 % of the soils, 17 % of the drill assays, Au-ICP21's limit 0.001 halved). When the
// smallest positive value holds at least minShare of them it is that floor: { floor, n, share, dl: 2 x floor }, else null.
export function censoringFloor(values, { minShare = 0.05 } = {}) {
  let min = Infinity, nPos = 0;
  for (const v of values || []) if (typeof v === "number" && v > 0) { nPos++; if (v < min) min = v; }
  if (!nPos || !Number.isFinite(min)) return null;
  let n = 0;
  for (const v of values) if (typeof v === "number" && Math.abs(v - min) <= min * 1e-9) n++;
  return n >= 20 && n / nPos >= minShare ? { floor: min, n, share: n / nPos, dl: Math.round(min * 2 * 1e9) / 1e9 } : null;
}
export function suggestDetectionLimit(assays, symbol) {
  const counts = new Map();
  let minPos = Infinity;
  for (const a of assays || []) {
    const v = a?.values?.[symbol];
    if (typeof v !== "number" || !(v > 0)) continue;
    if (a.qualifiers?.[symbol] === "<") { const dl = Math.round(v * 2 * 1e9) / 1e9; counts.set(dl, (counts.get(dl) || 0) + 1); }
    else if (v < minPos) minPos = v;
  }
  if (counts.size) { let best = null, n = -1; counts.forEach((c, x) => { if (c > n || (c === n && x < best)) { best = x; n = c; } }); return { limit: best, basis: "lt", n }; }
  // #1520 — no '<' results, but a floor holding a share of the values: half the limit was substituted before import
  const fl = censoringFloor((assays || []).map((a) => a?.values?.[symbol]));
  if (fl) return { limit: fl.dl, basis: "floor", floor: fl.floor, n: fl.n, share: fl.share };
  // TASKS.csv #2354 — six significant figures: a pXRF-converted 0.016349000000000002 was offered as it was stored
  return Number.isFinite(minPos) ? { limit: Number(minPos.toPrecision(6)), basis: "min" } : { limit: null, basis: null };
}
// Control-chart order: by sample id (natural order: S9 before S10) when every insertion has one — the order the lab
// received them — otherwise the order the rows were imported in. Returns { rows, bySampleId }.
export function orderForControlChart(rows) {
  const all = (rows || []).every((r) => r.sample_id != null && r.sample_id !== "");
  if (!all || !rows.length) return { rows: rows || [], bySampleId: false };
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return { rows: rows.slice().sort((a, b) => coll.compare(String(a.sample_id), String(b.sample_id))), bySampleId: true };
}

// TASKS.csv #2503 (review #2486, WA lithium) — a detection limit printed as a number a person reads: four significant figures
// (0.004645329 -> 0.004645), never the float tail of a unit conversion
export function formatLimit(x) {
  return x == null || !Number.isFinite(Number(x)) ? "" : String(Number(Number(x).toPrecision(4)));
}
// a lab prints its limits as round figures (0.01, 0.005, 2, 0.25): a '<' limit with more than two significant figures was converted
// at import (from another unit or an oxide: <0.01 % Li2O became <0.004645329 % Li) and is not the lab's own number
export function limitLooksConverted(x) {
  const v = Number(x);
  if (!(v > 0) || !Number.isFinite(v)) return false;
  return Math.abs(Number(v.toPrecision(2)) - v) > v * 1e-9;
}

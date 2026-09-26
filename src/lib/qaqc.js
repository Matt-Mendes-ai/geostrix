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

// TASKS.csv #400 — name matching alone silently dropped real holes: "BLK-22-01" (a Block-22 hole) or
// "STD-..." read as QC and vanished from intercepts, compositing, estimation. Now, in order:
//   1. a sample_type / QC-type column on the row (acQuire / MX exports keep QC under the real hole_id and
//      mark it there) decides, when it holds a recognisable value;
//   2. a hole that exists in the COLLAR table is a drillhole, never a QC insert, whatever its name
//      (the store registers collar ids here — setKnownHoleIds);
//   3. only then the hole_id substring patterns.
let registeredHoles = null;
export function setKnownHoleIds(ids) { registeredHoles = ids && ids.size !== 0 ? new Set(ids) : null; }
const TYPE_RULES = [
  ["blank", /^(blk|blank|bl)\b|^(field_?blank|coarse_?blank|pulp_?blank)/],
  ["duplicate", /^(dup|duplicate|fd|cd|pd|rep|repeat|field_?dup|coarse_?dup|pulp_?dup|twin)/],
  ["standard", /^(std|standard|crm|srm|ref|reference|oreas|cert)/],
  ["regular", /^(sample|samp|core|rc|dd|reg|regular|primary|prim|original|orig|routine|drill|norm|normal|assay)/],
];
export function sampleTypeClass(t) {
  const s = String(t ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  for (const [cls, re] of TYPE_RULES) if (re.test(s)) return cls;
  return null; // unrecognised label -> fall back to the other rules
}

// Order matters: blank and duplicate markers are checked before standard, since they're the more
// specific/unambiguous signals — a hole_id can't simultaneously BE a blank and a standard, but
// nothing stops an unlucky standard name from containing a duplicate-like substring by coincidence.
// Accepts an assay ROW (preferred: sample_type is used) or a bare hole_id string (older callers).
export function classifyQAQCRow(rowOrId, patterns = DEFAULT_QAQC_PATTERNS, knownHoles = registeredHoles) {
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
export function excludeQAQC(assays, patterns = DEFAULT_QAQC_PATTERNS) {
  return assays.filter((a) => classifyQAQCRow(a, patterns) === "regular");
}

// TASKS.csv #400 — what is being left out, and why, so an exclusion is never silent: distinct ids per class.
export function excludedQAQCIds(assays, patterns = DEFAULT_QAQC_PATTERNS) {
  const out = { standard: new Map(), blank: new Map(), duplicate: new Map() };
  assays.forEach((a) => {
    const c = classifyQAQCRow(a, patterns);
    if (c === "regular") return;
    const why = sampleTypeClass(a.sample_type) ? "sample type" : "name";
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
export function duplicatePairs(assays, symbol, elementUnits, patterns = DEFAULT_QAQC_PATTERNS, { minMean = 0 } = {}) {
  const originals = new Map(), bySampleId = new Map();
  assays.forEach((a) => {
    if (classifyQAQCRow(a, patterns) !== "regular") return;
    originals.set(`${a.hole_id}|${a.from}|${a.to}`, a);
    if (a.sample_id) bySampleId.set(String(a.sample_id), a);
  });
  const pairs = [];
  assays.forEach((a) => {
    if (classifyQAQCRow(a, patterns) !== "duplicate") return;
    let orig = null, how = "";
    if (a.parent_id && bySampleId.has(String(a.parent_id))) { orig = bySampleId.get(String(a.parent_id)); how = "parent id"; }
    else if (originals.has(`${a.hole_id}|${a.from}|${a.to}`)) { orig = originals.get(`${a.hole_id}|${a.from}|${a.to}`); how = "same interval"; }
    else { orig = originals.get(`${stripDuplicateMarker(a.hole_id, patterns)}|${a.from}|${a.to}`) || null; how = "name"; }
    if (!orig) return;
    const v1 = valueIn(orig, symbol, elementUnits[symbol] || "ppm", elementUnits);
    const v2 = valueIn(a, symbol, elementUnits[symbol] || "ppm", elementUnits);
    if (v1 == null || v2 == null) return;
    const mean = (v1 + v2) / 2;
    const rpd = mean !== 0 ? (Math.abs(v1 - v2) / mean) * 100 : 0;
    pairs.push({ original_hole: orig.hole_id, duplicate_hole: a.hole_id, from: a.from, to: a.to, v1, v2, rpd, how, belowLimit: minMean > 0 && mean < minMean });
  });
  return pairs;
}

// share of the counted pairs (not below the limit) within `threshold` % RPD
export function duplicateSummary(pairs, threshold = 20) {
  const used = pairs.filter((p) => !p.belowLimit);
  const within = used.filter((p) => p.rpd <= threshold).length;
  return { used: used.length, below: pairs.length - used.length, within, pctWithin: used.length ? (100 * within) / used.length : null };
}

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

// Order matters: blank and duplicate markers are checked before standard, since they're the more
// specific/unambiguous signals — a hole_id can't simultaneously BE a blank and a standard, but
// nothing stops an unlucky standard name from containing a duplicate-like substring by coincidence.
export function classifyQAQCRow(hole_id, patterns = DEFAULT_QAQC_PATTERNS) {
  const id = (hole_id || "").toLowerCase();
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

// Groups every "standard"-classified assay row by its own exact hole_id (real labs commonly reuse
// the identical insert ID, e.g. "OREAS622", across many batches — that repetition IS the population
// a control chart is built from). Groups with fewer than 2 occurrences are dropped — nothing to chart.
export function standardGroups(assays, patterns = DEFAULT_QAQC_PATTERNS) {
  const byId = new Map();
  assays.forEach((a) => {
    if (classifyQAQCRow(a.hole_id, patterns) !== "standard") return;
    if (!byId.has(a.hole_id)) byId.set(a.hole_id, []);
    byId.get(a.hole_id).push(a);
  });
  return Array.from(byId.entries()).filter(([, rows]) => rows.length >= 2).map(([id, rows]) => ({ id, rows }));
}

// One standard group's measurements for a given element, in insertion order, with control limits
// computed from that same series (self-referencing, see header comment) and each point flagged
// against the 2SD/3SD bands.
export function standardSeries(rows, symbol, elementUnits) {
  const points = rows.map((r, i) => ({ i, hole_id: r.hole_id, from: r.from, to: r.to, value: valueIn(r, symbol, elementUnits[symbol] || "ppm", elementUnits) })).filter((p) => p.value != null);
  const values = points.map((p) => p.value);
  const limits = controlLimits(values);
  if (!limits) return { points: [], limits: null };
  const flagged = points.map((p) => ({ ...p, outside2sd: p.value > limits.ucl2 || p.value < limits.lcl2, outside3sd: p.value > limits.ucl3 || p.value < limits.lcl3 }));
  return { points: flagged, limits };
}

// Blank rows for a given element, flagged against `threshold` (an absolute value in the element's
// display unit — e.g. 0.05 ppm Au — since there's no universal "5x detection limit" GeoStrix can
// derive automatically without a detection-limit field in the assay schema, which it doesn't have).
export function blankRows(assays, symbol, elementUnits, threshold, patterns = DEFAULT_QAQC_PATTERNS) {
  return assays.filter((a) => classifyQAQCRow(a.hole_id, patterns) === "blank")
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
export function duplicatePairs(assays, symbol, elementUnits, patterns = DEFAULT_QAQC_PATTERNS) {
  const originals = new Map();
  assays.forEach((a) => {
    if (classifyQAQCRow(a.hole_id, patterns) !== "regular") return;
    originals.set(`${a.hole_id}|${a.from}|${a.to}`, a);
  });
  const pairs = [];
  assays.forEach((a) => {
    if (classifyQAQCRow(a.hole_id, patterns) !== "duplicate") return;
    const base = stripDuplicateMarker(a.hole_id, patterns);
    const orig = originals.get(`${base}|${a.from}|${a.to}`);
    if (!orig) return;
    const v1 = valueIn(orig, symbol, elementUnits[symbol] || "ppm", elementUnits);
    const v2 = valueIn(a, symbol, elementUnits[symbol] || "ppm", elementUnits);
    if (v1 == null || v2 == null) return;
    const mean = (v1 + v2) / 2;
    const rpd = mean !== 0 ? (Math.abs(v1 - v2) / mean) * 100 : 0;
    pairs.push({ original_hole: orig.hole_id, duplicate_hole: a.hole_id, from: a.from, to: a.to, v1, v2, rpd });
  });
  return pairs;
}

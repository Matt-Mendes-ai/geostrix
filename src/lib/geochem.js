// ============================================================
// Geochemistry: element handling + diagram projections
// ============================================================

export const ELEMENT_SYMBOLS = ["Ag","Al","As","Au","B","Ba","Be","Bi","Br","Ca","Cd","Ce","Cl","Co","Cr","Cs","Cu",
  "Dy","Er","Eu","F","Fe","Ga","Gd","Ge","Hf","Hg","Ho","In","Ir","K","La","Li","Lu","Mg","Mn","Mo","Na","Nb",
  "Nd","Ni","Os","P","Pb","Pd","Pr","Pt","Rb","Re","Rh","Ru","S","Sb","Sc","Se","Si","Sm","Sn","Sr","Ta","Tb",
  "Te","Th","Ti","Tl","Tm","U","V","W","Y","Yb","Zn","Zr"];
const MAJOR_PCT = new Set(["Al","Ca","Fe","K","Mg","Na","P","S","Ti","Si","Mn","Cr"]);

// TASKS.csv #210 — real-world lab exports rarely use a bare element symbol as the header: a
// method/instrument code commonly sits BETWEEN the element and its unit (e.g. pXRF exports like
// "Ag_XRF_Corrected_ppm_D"), which the old approach (strip from the first unit-token match anywhere
// in the string, then require an EXACT match against the remainder) couldn't handle — it stripped
// "_ppm_D" off the end but left "Ag_XRF_Corrected" behind, no exact match. Matching on the FIRST
// delimiter-separated token instead (the element symbol always leads a lab column name in every
// real export seen so far — BESTEL, XRF, ICP, AA, and generic exports alike) is robust to whatever
// comes after it, unit token present or not, method code or not.
export function isElementColumn(header) {
  if (!header) return false;
  const cleaned = String(header).replace(/\(.*?\)/g, " "); // drop parenthetical units, e.g. "Au (ppm)"
  const first = cleaned.split(/[\s_-]+/)[0].trim();
  return ELEMENT_SYMBOLS.find((s) => s.toLowerCase() === first.toLowerCase()) || false;
}
export function inferUnit(header, symbol) {
  const h = String(header).toLowerCase();
  if (h.includes("ppb")) return "ppb";
  // TASKS.csv #210 — "gpt" (grams per tonne) is the standard unit lab reports use for Au/Ag/Pt/Pd
  // grades and is numerically identical to ppm for a solid (g/tonne = mg/kg = ppm), so it belongs in
  // the same bucket as ppm here — this only affects which unit shows up in the display dropdown and
  // valueIn()'s unit-conversion bucketing, not the raw stored value.
  if (h.includes("ppm") || h.includes("gpt") || h.includes("g/t")) return "ppm";
  if (h.includes("pct") || h.includes("%")) return "%";
  if (symbol === "Au") return "ppm";
  return MAJOR_PCT.has(symbol) ? "%" : "ppm";
}
// TASKS.csv #270 (LOW-1) - elements whose grade is universally quoted in g/t rather than ppm. The two
// units are numerically identical for a solid (g/tonne = mg/kg = ppm), so this only ever changes the
// LABEL next to a cutoff/cap field - but a cutoff typed one order of magnitude out is a real risk, and
// showing the unit the user actually thinks in is the cheapest way to reduce it.
export const PRECIOUS_METALS = new Set(["Au", "Ag", "Pt", "Pd"]);

// TASKS.csv #261 — qualifier handling for censored assay values.
//   "<x"  below detection limit  -> x/2  (half-detection substitution: standard practice)
//   ">x"  OVER-RANGE             -> x    (the detection CEILING, NOT a fabricated multiple of it)
// The ">" branch used to return v * 1.5, inventing 50% of grade in exactly the highest-leverage
// samples in the dataset — a lab reporting ">100 ppm Au" means "this needs a gravimetric re-assay",
// not "150 ppm". x1.5 is not a convention anywhere; reading over-range AT the ceiling is the
// conservative and defensible choice, and the qualifier is now recorded so dataQC.js can tell the user
// these are placeholders rather than letting the substitution stay invisible.
export function parseAssayValue(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  const s = String(raw).trim();
  if (s.startsWith("<")) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : v / 2; }
  if (s.startsWith(">")) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : v; }
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

// The qualifier ('<' below detection / '>' over-range / null plain number) that parseAssayValue
// applied, for callers that need to flag a value rather than just use it (dataQC's over-range warning).
export function assayQualifier(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return null;
  const s = String(raw).trim();
  if (s.startsWith("<") && !isNaN(parseFloat(s.slice(1)))) return "<";
  if (s.startsWith(">") && !isNaN(parseFloat(s.slice(1)))) return ">";
  return null;
}

// element wt% -> oxide wt%
const OXIDE_FACTOR = { Na: 1.348, K: 1.205, Mg: 1.658, Ca: 1.399, Fe: 1.2865, Ti: 1.668, Al: 1.889, P: 2.291, Mn: 1.291, Si: 2.1392 };
export function toOxide(elementPct, symbol) { return elementPct == null ? null : elementPct * (OXIDE_FACTOR[symbol] || 1); }

// Normalize a sample's element values to a consistent unit for a symbol.
// values are stored in their native unit (per assayElements), so convert to the needed unit here.
export function valueIn(sample, symbol, unit, elementUnits) {
  const raw = sample.values[symbol];
  if (raw == null) return null;
  const native = elementUnits[symbol] || "ppm";
  const asPpm = native === "%" ? raw * 10000 : native === "ppb" ? raw / 1000 : raw;
  if (unit === "%") return asPpm / 10000;
  if (unit === "ppb") return asPpm * 1000;
  return asPpm;
}

// ---------- best-intercept / downhole intersection compositing ----------
// TASKS.csv #132 (Micromine-specialist audit finding): "what are my best Au intercepts >0.5 g/t over
// >3m" currently has no in-app answer — this is the standard exploration-industry "composite" routine
// for it. Per hole, walk the from/to intervals in depth order; every run of above-cutoff samples is
// merged into one composite, allowed to bridge a short run of below-cutoff ("internal dilution")
// material up to maxInternalDilution metres without breaking the intercept — exactly like a geologist
// manually compositing a log by hand, just automated. Below-cutoff rows bridged into a composite keep
// their OWN real assayed grade (not assumed zero) — only depth genuinely uncovered by any assay row
// (a gap between two rows, e.g. unsampled/lost core) falls back to a 0-grade filler for that portion.
// The composite's reported grade is length-weighted across every sub-interval it contains, so a wide
// intercept with a diluting low-grade patch inside it reports an honestly diluted grade, not just the
// grade of the above-cutoff pieces alone.
export function computeBestIntercepts(assays, symbol, unit, elementUnits, opts = {}) {
  const cutoff = opts.cutoff ?? 0;
  const maxInternalDilution = opts.maxInternalDilution ?? 2;
  const minLength = opts.minLength ?? 0;
  const EPS = 1e-6;

  const byHole = new Map();
  assays.forEach((a) => {
    if (a.from == null || a.to == null || a.to <= a.from || a.hole_id == null) return;
    if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []);
    byHole.get(a.hole_id).push(a);
  });

  const composites = [];
  byHole.forEach((rows, hole_id) => {
    const sorted = rows.slice().sort((a, b) => a.from - b.from);
    let current = null; // { from, to, subs: [{from,to,value,width}] }
    let pending = []; // below-cutoff rows seen since the last above-cutoff row, not yet committed
    const flush = () => {
      if (!current) return;
      const length = current.to - current.from;
      if (length >= minLength - EPS) {
        const gradeLen = current.subs.reduce((s, r) => s + (r.value || 0) * r.width, 0);
        composites.push({
          hole_id, from: current.from, to: current.to, length,
          avgGrade: length > 0 ? gradeLen / length : 0,
          intervals: current.subs.filter((r) => r.value != null && r.value >= cutoff).length,
        });
      }
      current = null; pending = [];
    };
    for (const r of sorted) {
      const width = r.to - r.from;
      const v = valueIn(r, symbol, unit, elementUnits);
      const above = v != null && v >= cutoff;
      if (above) {
        if (current) {
          const gap = r.from - current.to; // total distance to bridge, sampled + unsampled
          if (gap <= maxInternalDilution + EPS) {
            pending.forEach((p) => current.subs.push(p));
            const pendingWidth = pending.reduce((s, p) => s + p.width, 0);
            const unsampled = gap - pendingWidth;
            if (unsampled > EPS) current.subs.push({ from: current.to + pendingWidth, to: r.from, value: 0, width: unsampled });
            current.to = r.to;
            current.subs.push({ from: r.from, to: r.to, value: v, width });
            pending = [];
          } else {
            flush();
            current = { from: r.from, to: r.to, subs: [{ from: r.from, to: r.to, value: v, width }] };
          }
        } else {
          current = { from: r.from, to: r.to, subs: [{ from: r.from, to: r.to, value: v, width }] };
        }
      } else if (current) {
        pending.push({ from: r.from, to: r.to, value: v == null ? 0 : v, width });
        if (r.to - current.to > maxInternalDilution + EPS) flush(); // already past the bridging allowance
      }
    }
    flush();
  });

  composites.sort((a, b) => (b.avgGrade * b.length) - (a.avgGrade * a.length));
  return composites;
}

// TASKS.csv #230 (Micromine/mineral-exploration/Leapfrog-specialist audit finding) — best-intercept
// reporting only ever showed ONE element (whichever the intercept was composited against), with no way
// to see what a second/third element graded over that SAME depth window (e.g. "what's the Ag and Cu
// over this Au intercept?" — a routine question in a polymetallic system). Rather than re-running the
// whole compositing/cutoff/dilution logic per extra element (which would produce a DIFFERENT set of
// break points per element — not what's wanted here), this just length-weight-averages a chosen
// element's raw assay values over an ALREADY-COMPOSITED interval's fixed from/to window, the same
// weighting computeBestIntercepts itself uses. Below-detection substitution/unit conversion goes
// through the same valueIn() every other grade figure in this file uses. Returns null (not 0) if no
// assay row for this element overlaps the window at all, so the caller can render "—" rather than a
// misleading zero.
// TASKS.csv #230 — per-intercept domain/lithology breakdown, the last sub-item of the three-audit
// finding on intercept reporting. Answers "what is this intercept actually hosted in?" — which is a
// different and often more important question than its grade: an 8 m intercept sitting entirely
// inside one rhyolite unit means something quite different from the same 8 m straddling a contact
// between two units, and a report that can't distinguish those hides real geology.
//
// Returns every domain row overlapping the interval with the METRES of overlap and the fraction of
// the interval it accounts for, sorted longest-first, so the caller can show either the dominant
// host (parts[0]) or the full breakdown. Overlap is length-weighted exactly the way avgGradeInRange
// below and computeBestIntercepts above already weight things, so all three agree about what "how
// much of this interval" means.
//
// `domainRows` is any interval layer in this app's standard shape ([{hole_id, from, to, value}]) —
// lithology is the obvious one, but alteration/vein/any custom interval layer works identically,
// which is why this takes rows rather than hard-coding `litho`.
export function domainsForInterval(domainRows, hole_id, from, to) {
  const EPS = 1e-6;
  const width = to - from;
  if (!(width > EPS)) return { parts: [], dominant: null, covered: 0, overlapping: false };
  const byValue = new Map();
  const spans = [];
  let summed = 0;
  (domainRows || []).forEach((d) => {
    if (d.hole_id !== hole_id || d.from == null || d.to == null || d.to <= d.from) return;
    const ovFrom = Math.max(d.from, from), ovTo = Math.min(d.to, to);
    const ov = ovTo - ovFrom;
    if (ov <= EPS) return;
    const key = String(d.value ?? "").trim() || "(unlabelled)";
    byValue.set(key, (byValue.get(key) || 0) + ov);
    spans.push([ovFrom, ovTo]);
    summed += ov;
  });
  // Real coverage is the UNION of the overlapping spans, not their sum. Discovered while verifying
  // this against the real harry_property lithology log, which genuinely contains overlapping
  // intervals (45.50-62.00 FINT and 49.00-62.00 DACT overlap by 13 m). Summing gave "covered" > 1 and
  // per-unit fractions that added to 150%, which reads as a broken report. Overlapping logs are a
  // real data-quality problem — from bad merges, re-logging, or a sloppy export — so this measures
  // coverage correctly AND flags the overlap rather than silently normalising it away, since the
  // geologist needs to know their log has a genuine conflict here.
  spans.sort((a, b) => a[0] - b[0]);
  let union = 0, curStart = null, curEnd = null;
  spans.forEach(([s, e]) => {
    if (curStart === null) { curStart = s; curEnd = e; return; }
    if (s <= curEnd + EPS) { curEnd = Math.max(curEnd, e); }
    else { union += curEnd - curStart; curStart = s; curEnd = e; }
  });
  if (curStart !== null) union += curEnd - curStart;

  const parts = Array.from(byValue.entries())
    .map(([value, metres]) => ({ value, metres, fraction: metres / width }))
    .sort((a, b) => b.metres - a.metres);
  return {
    parts,
    dominant: parts.length ? parts[0] : null,
    // Fraction of the interval covered by ANY domain row. Reported separately from the parts
    // themselves: a dominant unit at 100% of the COVERED length is misleading if the log only covers
    // half the intercept, and the caller needs to be able to say so rather than implying full
    // knowledge from partial logging.
    covered: Math.min(1, union / width),
    // True when the source rows overlap each other within this interval, i.e. the same metre is
    // logged as more than one unit — in which case the per-unit fractions legitimately sum above 100%
    // and the caller should say so rather than presenting them as a clean split.
    overlapping: summed > union + EPS,
  };
}

export function avgGradeInRange(assays, hole_id, from, to, symbol, unit, elementUnits) {
  const EPS = 1e-6;
  let weighted = 0, coveredWidth = 0;
  assays.forEach((a) => {
    if (a.hole_id !== hole_id || a.from == null || a.to == null || a.to <= a.from) return;
    const overlapFrom = Math.max(a.from, from), overlapTo = Math.min(a.to, to);
    const overlap = overlapTo - overlapFrom;
    if (overlap <= EPS) return;
    const v = valueIn(a, symbol, unit, elementUnits);
    if (v == null) return;
    weighted += v * overlap;
    coveredWidth += overlap;
  });
  if (coveredWidth <= EPS) return null;
  return weighted / coveredWidth;
}

// ---------- fixed-length downhole compositing ----------
// TASKS.csv #118 (Micromine/Leapfrog-specialist audit finding): the standard pre-estimation step —
// raw sample intervals are almost never a convenient regular length for variography/block-model
// estimation, so they're composited to a fixed length (1m/2m/5m/etc) first. Two things a naive
// "just chop into N-metre chunks" implementation gets wrong, both handled here:
//  1. Domain honoring — a composite must not straddle a domain boundary (e.g. half in one lithology,
//     half in another), because that would blend grade across a geological contact that the estimation
//     step is supposed to respect. Domain rows (optional) force a composite break at every boundary,
//     so composite length is capped at `length` but can be shorter right at a domain change.
//  2. High-grade capping — an optional per-sample cap is applied to each RAW sample's grade before
//     it's folded into any composite average, matching how Micromine/Leapfrog cap outliers prior to
//     compositing (capping the composite average after the fact would still let one wildly anomalous
//     thin sample dominate a thick composite; capping per-sample is the industry-standard order).
// Each composite's grade is length-weighted across whatever raw sample material actually falls inside
// it (like computeBestIntercepts, above) — a composite interval only partially covered by real assay
// data is still reported, but flagged via `coverage` (fraction 0..1) so a low-coverage composite (e.g.
// a metre of missing/lost core) can be filtered out downstream rather than silently treated as a full
// real sample.
// TASKS.csv #286 — the same "exact duplicate" test compositeDownhole applies internally, exposed so
// the compositing UI can TELL the user their input had duplicates rather than silently fixing it
// behind their back (the finding's "or at minimum warn in the compositing UI"; this does both).
// Counts rows dropped as exact duplicates, and separately the (hole_id, from, to) intervals that
// appear more than once with DIFFERENT results — those are conflicts compositing deliberately does
// NOT resolve, and they're the ones worth going back to the source data for.
export function countDuplicateAssayIntervals(assays) {
  const exact = new Set(), byInterval = new Map();
  let exactDuplicates = 0;
  const conflicting = new Set();
  (assays || []).forEach((a) => {
    if (a.from == null || a.to == null || a.to <= a.from || a.hole_id == null) return;
    const iv = `${a.hole_id}|${a.from}|${a.to}`;
    const key = `${iv}|${JSON.stringify(a.values ?? null)}`;
    if (exact.has(key)) { exactDuplicates++; return; }
    exact.add(key);
    if (byInterval.has(iv)) conflicting.add(iv);
    byInterval.set(iv, key);
  });
  return { exactDuplicates, conflictingIntervals: conflicting.size };
}

export function compositeDownhole(assays, symbol, unit, elementUnits, opts = {}) {
  const length = opts.length ?? 2;
  const minCoverage = opts.minCoverage ?? 0.5;
  const capValue = opts.capValue ?? null;
  const domainRows = opts.domainRows ?? null; // [{hole_id, from, to, value}] | null — e.g. a litho layer
  const EPS = 1e-6;
  if (length <= 0) return [];

  const byHole = new Map();
  // TASKS.csv #286 (Micromine-specialist review) — exact-duplicate raw intervals are dropped BEFORE
  // any length-weighting. dataQC.js's validateAssays already flags "Duplicate assay interval X–Ym —
  // likely imported twice" as a real, acknowledged occurrence, but compositing itself had no defense
  // if the user composited before cleaning it up: the `overlapping.forEach` loop below sums EVERY
  // overlapping row, so a doubled row contributed its grade and its length twice. That doesn't just
  // double a number — it silently re-weights the composite toward whichever interval happened to be
  // duplicated (worked case verified for TASKS.csv #286: a duplicated high-grade metre pulls a 2 m
  // composite from 5.5 to 7.0 g/t), which then flows straight into an estimation input.
  //
  // "Exact duplicate" deliberately includes the values payload, not just (hole_id, from, to): two rows
  // over the same interval with DIFFERENT results are a genuine data conflict (a re-assay, a mislabeled
  // sample), not a double-import, and silently discarding one of them would be its own quiet data loss.
  // Those are left alone and stay dataQC's business to report.
  const dupSeen = new Set();
  let duplicatesSkipped = 0;
  assays.forEach((a) => {
    if (a.from == null || a.to == null || a.to <= a.from || a.hole_id == null) return;
    const key = `${a.hole_id}|${a.from}|${a.to}|${JSON.stringify(a.values ?? null)}`;
    if (dupSeen.has(key)) { duplicatesSkipped++; return; }
    dupSeen.add(key);
    if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []);
    byHole.get(a.hole_id).push(a);
  });

  const domainByHole = new Map();
  if (domainRows) {
    domainRows.forEach((d) => {
      if (d.from == null || d.to == null || d.to <= d.from || d.hole_id == null) return;
      if (!domainByHole.has(d.hole_id)) domainByHole.set(d.hole_id, []);
      domainByHole.get(d.hole_id).push(d);
    });
    domainByHole.forEach((rows) => rows.sort((a, b) => a.from - b.from));
  }

  // domain value covering depth d in this hole's domain rows (or null if unsampled/undefined there)
  function domainAt(domRows, d) {
    if (!domRows) return null;
    const hit = domRows.find((r) => d >= r.from - EPS && d < r.to - EPS);
    return hit ? hit.value : null;
  }

  const composites = [];
  byHole.forEach((rows, hole_id) => {
    const sorted = rows.slice().sort((a, b) => a.from - b.from);
    const holeStart = sorted[0].from;
    const holeEnd = sorted.reduce((m, r) => Math.max(m, r.to), sorted[0].to);
    const domRows = domainByHole.get(hole_id) || null;

    // build the list of break points: every domain boundary inside the hole's sampled range (both the
    // start and end of each domain row — a boundary is wherever the domain value changes, so
    // registering both edges naturally captures that even where two domain rows aren't perfectly
    // adjacent), then fixed-length steps RE-ANCHORED at each of those boundaries.
    //
    // TASKS.csv #262 — the fixed-length grid used to run continuously from holeStart and simply get
    // chopped by each domain edge, which strands a short residual on BOTH sides of every contact
    // (length=2 with a contact at 3 m gave 2.0, 1.0, 1.0, 2.0 …). Re-anchoring means each domain
    // interval is composited from its own top, so the only short composite in a domain is the last one
    // at its base — the standard downhole-compositing convention, and it roughly halves the number of
    // short-support composites sitting exactly on the contacts that matter most.
    const round6 = (d) => Math.round(d * 1e6) / 1e6;
    const anchors = new Set([holeStart, holeEnd]);
    if (domRows) domRows.forEach((r) => {
      if (r.from > holeStart + EPS && r.from < holeEnd - EPS) anchors.add(round6(r.from));
      if (r.to > holeStart + EPS && r.to < holeEnd - EPS) anchors.add(round6(r.to));
    });
    const sortedAnchors = Array.from(anchors).sort((a, b) => a - b);
    const breaks = new Set(sortedAnchors);
    for (let a = 0; a < sortedAnchors.length - 1; a++) {
      const segStart = sortedAnchors[a], segEnd = sortedAnchors[a + 1];
      for (let d = segStart + length; d < segEnd - EPS; d += length) breaks.add(round6(d));
    }
    const sortedBreaks = Array.from(breaks).filter((d) => d >= holeStart - EPS && d <= holeEnd + EPS).sort((a, b) => a - b);

    for (let i = 0; i < sortedBreaks.length - 1; i++) {
      let from = sortedBreaks[i], to = sortedBreaks[i + 1];
      if (to - from <= EPS) continue;
      // a segment between two consecutive fixed-length/domain breaks can still be longer than `length`
      // if no domain break fell inside it (the fixed-length breaks already prevent that in practice,
      // but guard anyway) — clip to `length` from `from` if so.
      if (to - from > length + EPS) to = from + length;

      const overlapping = sorted.filter((r) => r.from < to - EPS && r.to > from + EPS);
      let gradeLen = 0, coveredLen = 0;
      overlapping.forEach((r) => {
        const ovFrom = Math.max(r.from, from), ovTo = Math.min(r.to, to);
        const ov = ovTo - ovFrom;
        if (ov <= EPS) return;
        let v = valueIn(r, symbol, unit, elementUnits);
        if (v == null) return;
        if (capValue != null && v > capValue) v = capValue;
        gradeLen += v * ov;
        coveredLen += ov;
      });
      const segLen = to - from;
      const coverage = segLen > 0 ? Math.min(1, coveredLen / segLen) : 0;
      if (coverage < minCoverage - EPS) continue; // too little real sample material in this segment
      // Note: avgGrade is length-weighted across the COVERED material only (gradeLen / coveredLen),
      // not diluted by treating the uncovered remainder as zero grade — unlike computeBestIntercepts'
      // internal-dilution bridging above, an uncovered stretch here means "no data" (lost core, gap in
      // sampling), not "assayed and genuinely low-grade", so folding it in as a zero would understate
      // the composite. `coverage` is reported alongside so a caller can filter/flag thin-data composites
      // instead of having that silently baked into the grade number.
      composites.push({
        hole_id, from, to, length: segLen,
        avgGrade: coveredLen > 0 ? gradeLen / coveredLen : 0,
        coverage,
        domain: domRows ? domainAt(domRows, (from + to) / 2) : null,
      });
    }
  });

  composites.sort((a, b) => (a.hole_id < b.hole_id ? -1 : a.hole_id > b.hole_id ? 1 : a.from - b.from));
  return composites;
}

// ---------- diagram definitions ----------
// Each: id, label, requires[], xLabel, yLabel, log{x,y}, project(sample, units) -> {x,y} | null,
// fields[] (polygon boundaries drawn as reference), and optional axis ranges.

export const DIAGRAMS = {
  tas: {
    id: "tas",
    label: "TAS (Le Bas et al. 1986)",
    caption: "Total alkali–silica. Requires fresh rock; alkalis are alteration-mobile.",
    requires: ["Si", "Na", "K"],
    xLabel: "SiO₂ (wt%)", yLabel: "Na₂O + K₂O (wt%)",
    xRange: [35, 80], yRange: [0, 16],
    project: (s, u) => {
      const Si = valueIn(s, "Si", "%", u), Na = valueIn(s, "Na", "%", u), K = valueIn(s, "K", "%", u);
      if ([Si, Na, K].some((v) => v == null)) return null;
      return { x: toOxide(Si, "Si"), y: toOxide(Na, "Na") + toOxide(K, "K") };
    },
    fields: tasFields(),
  },
  winchester: {
    id: "winchester",
    label: "Zr/TiO₂ vs Nb/Y (Winchester & Floyd 1977)",
    caption: "Immobile-element classification. Robust to alteration.",
    requires: ["Zr", "Ti", "Nb", "Y"],
    xLabel: "Nb/Y", yLabel: "Zr/TiO₂",
    logX: true, logY: true,
    xRange: [0.01, 10], yRange: [0.0001, 0.1],
    project: (s, u) => {
      const Zr = valueIn(s, "Zr", "ppm", u), Ti = valueIn(s, "Ti", "%", u), Nb = valueIn(s, "Nb", "ppm", u), Y = valueIn(s, "Y", "ppm", u);
      if ([Zr, Ti, Nb, Y].some((v) => v == null) || Y === 0 || Ti === 0) return null;
      const TiO2 = toOxide(Ti, "Ti"); // wt%
      return { x: Nb / Y, y: Zr / (TiO2 * 10000) }; // Zr(ppm)/TiO2(ppm)
    },
    fields: winchesterFields(),
  },
  afm: {
    id: "afm",
    label: "AFM (Irvine & Baragar 1971)",
    caption: "Tholeiitic vs calc-alkaline. Ternary A=Na₂O+K₂O, F=FeOt, M=MgO.",
    requires: ["Na", "K", "Fe", "Mg"],
    ternary: true,
    corners: ["A (Na₂O+K₂O)", "F (FeOt)", "M (MgO)"],
    project: (s, u) => {
      const Na = valueIn(s, "Na", "%", u), K = valueIn(s, "K", "%", u), Fe = valueIn(s, "Fe", "%", u), Mg = valueIn(s, "Mg", "%", u);
      if ([Na, K, Fe, Mg].some((v) => v == null)) return null;
      const A = toOxide(Na, "Na") + toOxide(K, "K"), F = toOxide(Fe, "Fe"), M = toOxide(Mg, "Mg");
      const t = A + F + M; if (t === 0) return null;
      return ternaryXY(A / t, F / t, M / t);
    },
    dividers: afmDivider(),
  },
  boxplot: {
    id: "boxplot",
    label: "Alteration Box Plot (Large et al. 2001)",
    caption: "Ishikawa AI vs CCPI. Standard for VMS/epithermal alteration vectoring.",
    requires: ["Na", "K", "Mg", "Ca", "Fe"],
    xLabel: "CCPI = 100(MgO+FeOt)/(MgO+FeOt+Na₂O+K₂O)", yLabel: "AI = 100(K₂O+MgO)/(K₂O+MgO+Na₂O+CaO)",
    xRange: [0, 100], yRange: [0, 100],
    project: (s, u) => {
      const Na = valueIn(s, "Na", "%", u), K = valueIn(s, "K", "%", u), Mg = valueIn(s, "Mg", "%", u), Ca = valueIn(s, "Ca", "%", u), Fe = valueIn(s, "Fe", "%", u);
      if ([Na, K, Mg, Ca, Fe].some((v) => v == null)) return null;
      const Na2O = toOxide(Na, "Na"), K2O = toOxide(K, "K"), MgO = toOxide(Mg, "Mg"), CaO = toOxide(Ca, "Ca"), FeO = toOxide(Fe, "Fe");
      const AI = (100 * (K2O + MgO)) / (K2O + MgO + Na2O + CaO || 1);
      const CCPI = (100 * (MgO + FeO)) / (MgO + FeO + Na2O + K2O || 1);
      return { x: CCPI, y: AI };
    },
    boxplotOverlay: true,
  },
  jensen: {
    id: "jensen",
    label: "Jensen cation plot (1976)",
    caption: "Al–(Fe+Ti)–Mg cation ternary for subalkaline volcanics.",
    requires: ["Al", "Fe", "Ti", "Mg"],
    ternary: true,
    corners: ["Al₂O₃", "FeOt+TiO₂", "MgO"],
    project: (s, u) => {
      const Al = valueIn(s, "Al", "%", u), Fe = valueIn(s, "Fe", "%", u), Ti = valueIn(s, "Ti", "%", u), Mg = valueIn(s, "Mg", "%", u);
      if ([Al, Fe, Ti, Mg].some((v) => v == null)) return null;
      const alC = toOxide(Al, "Al") / 50.98, feC = toOxide(Fe, "Fe") / 71.85 + toOxide(Ti, "Ti") / 79.87, mgC = toOxide(Mg, "Mg") / 40.30;
      const t = alC + feC + mgC; if (t === 0) return null;
      return ternaryXY(alC / t, feC / t, mgC / t);
    },
  },
  thnbyb: {
    id: "thnbyb",
    label: "Th/Yb vs Nb/Yb (Pearce 2008)",
    caption: "Immobile ratios; separates arc from MORB/OIB mantle array.",
    requires: ["Th", "Nb", "Yb"],
    xLabel: "Nb/Yb", yLabel: "Th/Yb",
    logX: true, logY: true,
    xRange: [0.1, 100], yRange: [0.01, 10],
    project: (s, u) => {
      const Th = valueIn(s, "Th", "ppm", u), Nb = valueIn(s, "Nb", "ppm", u), Yb = valueIn(s, "Yb", "ppm", u);
      if ([Th, Nb, Yb].some((v) => v == null) || Yb === 0) return null;
      return { x: Nb / Yb, y: Th / Yb };
    },
  },
  tizry: {
    id: "tizry",
    label: "Ti–Zr–Y (Pearce & Cann 1973)",
    caption: "Ternary discrimination for basaltic rocks — immobile elements, robust through greenschist-facies alteration common in VMS footwalls. Fields: A=island-arc tholeiite, B=IAT/MORB/calc-alkali basalt (overlap), C=calc-alkali basalt, D=within-plate basalt.",
    requires: ["Ti", "Zr", "Y"],
    ternary: true,
    corners: ["Ti/100", "Zr", "Y×3"],
    project: (s, u) => {
      const Ti = valueIn(s, "Ti", "ppm", u), Zr = valueIn(s, "Zr", "ppm", u), Y = valueIn(s, "Y", "ppm", u);
      if ([Ti, Zr, Y].some((v) => v == null)) return null;
      const a = Ti / 100, f = Zr, m = Y * 3;
      const t = a + f + m; if (t === 0) return null;
      return ternaryXY(a / t, f / t, m / t);
    },
  },
  thhfta: {
    id: "thhfta",
    label: "Th–Hf–Ta (Wood 1980)",
    caption: "Ternary tectonic discrimination using HFSE/Th — very resistant to hydrothermal alteration, useful for classifying altered VMS-hosting mafic volcanics.",
    requires: ["Th", "Hf", "Ta"],
    ternary: true,
    corners: ["Th", "Hf/3", "Ta"],
    project: (s, u) => {
      const Th = valueIn(s, "Th", "ppm", u), Hf = valueIn(s, "Hf", "ppm", u), Ta = valueIn(s, "Ta", "ppm", u);
      if ([Th, Hf, Ta].some((v) => v == null)) return null;
      const a = Th, f = Hf / 3, m = Ta;
      const t = a + f + m; if (t === 0) return null;
      return ternaryXY(a / t, f / t, m / t);
    },
  },
  per_al_k: {
    id: "per_al_k",
    label: "PER: Al₂O₃ vs 3K₂O (MacLean & Kranidiotis 1987)",
    caption: "Pearce element ratio — molar Al₂O₃ (immobile proxy) plotted against 3×molar K₂O. Unaltered rocks of one precursor fall on a line through the origin; departures above the fitted trend indicate K-metasomatism (sericite/K-feldspar addition), below indicates K loss.",
    requires: ["Al", "K"],
    xLabel: "Al₂O₃ (mol/100g)", yLabel: "3 × K₂O (mol/100g)",
    xRange: [0, 0.4], yRange: [0, 0.3],
    dynamicRange: true, trendLine: true,
    project: (s, u) => {
      const Al = valueIn(s, "Al", "%", u), K = valueIn(s, "K", "%", u);
      if ([Al, K].some((v) => v == null)) return null;
      const molAl2O3 = toOxide(Al, "Al") / MOLAR_MASS.Al2O3;
      const molK2O = toOxide(K, "K") / MOLAR_MASS.K2O;
      return { x: molAl2O3, y: 3 * molK2O };
    },
  },
  per_al_cana: {
    id: "per_al_cana",
    label: "PER: Al₂O₃ vs CaO+3Na₂O (Stanley & Madeisky 1994)",
    caption: "Pearce element ratio — molar Al₂O₃ vs molar (CaO+3Na₂O). Departure below the fitted trend indicates feldspar destruction (Ca/Na loss — sericitic/chloritic alteration); above indicates albitization or carbonate/epidote addition.",
    requires: ["Al", "Ca", "Na"],
    xLabel: "Al₂O₃ (mol/100g)", yLabel: "CaO + 3 Na₂O (mol/100g)",
    xRange: [0, 0.4], yRange: [0, 0.4],
    dynamicRange: true, trendLine: true,
    project: (s, u) => {
      const Al = valueIn(s, "Al", "%", u), Ca = valueIn(s, "Ca", "%", u), Na = valueIn(s, "Na", "%", u);
      if ([Al, Ca, Na].some((v) => v == null)) return null;
      const molAl2O3 = toOxide(Al, "Al") / MOLAR_MASS.Al2O3;
      const molCaO = toOxide(Ca, "Ca") / MOLAR_MASS.CaO;
      const molNa2O = toOxide(Na, "Na") / MOLAR_MASS.Na2O;
      return { x: molAl2O3, y: molCaO + 3 * molNa2O };
    },
  },
};

const MOLAR_MASS = { Al2O3: 101.96, K2O: 94.2, Na2O: 61.98, CaO: 56.08, MgO: 40.30, FeOt: 71.85, TiO2: 79.87 };

// ---------- REE / multi-element spider diagrams ----------
// Chondrite and primitive-mantle normalization values: McDonough & Sun (1995), ppm.
export const REE_ORDER = ["La", "Ce", "Pr", "Nd", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu"];
export const CHONDRITE_MS95 = { La: 0.237, Ce: 0.612, Pr: 0.095, Nd: 0.467, Sm: 0.153, Eu: 0.058, Gd: 0.2055, Tb: 0.0374, Dy: 0.254, Ho: 0.0566, Er: 0.1655, Tm: 0.0255, Yb: 0.170, Lu: 0.0254 };

export const MULTI_ELEMENT_ORDER = ["Cs", "Rb", "Ba", "Th", "U", "Nb", "Ta", "K", "La", "Ce", "Pr", "Sr", "Nd", "Sm", "Zr", "Hf", "Eu", "Ti", "Gd", "Tb", "Dy", "Y", "Ho", "Er", "Tm", "Yb", "Lu"];
export const PRIMITIVE_MANTLE_MS95 = { Cs: 0.032, Rb: 0.635, Ba: 6.989, Th: 0.085, U: 0.021, Nb: 0.713, Ta: 0.041, K: 250, La: 0.687, Ce: 1.775, Pr: 0.276, Sr: 21.1, Nd: 1.354, Sm: 0.444, Zr: 10.5, Hf: 0.309, Eu: 0.168, Ti: 1300, Gd: 0.596, Tb: 0.108, Dy: 0.737, Y: 4.55, Ho: 0.164, Er: 0.480, Tm: 0.074, Yb: 0.493, Lu: 0.074 };

// SPIDER_DIAGRAMS entries mirror DIAGRAMS' shape closely enough to share the module dropdown, but
// `project` isn't used — GeochemPlot's SpiderPlot renders every sample as its own normalized line
// (via reeProfile below) rather than reducing each sample to a single {x,y} point.
export const SPIDER_DIAGRAMS = {
  ree_chondrite: {
    id: "ree_chondrite", spider: true,
    label: "REE — chondrite-normalized (McDonough & Sun 1995)",
    caption: "Rare-earth element pattern, each sample normalized to chondrite. LREE enrichment/depletion and Eu anomalies are diagnostic of protolith and some alteration/mineralization styles.",
    requires: REE_ORDER, order: REE_ORDER, norm: CHONDRITE_MS95,
  },
  multi_pm: {
    id: "multi_pm", spider: true,
    label: "Multi-element — primitive-mantle-normalized (McDonough & Sun 1995)",
    caption: "Extended trace-element pattern normalized to primitive mantle. Useful for petrogenesis and for spotting LILE mobility (Cs/Rb/Ba/K/Sr) versus HFSE/REE immobility during alteration.",
    requires: MULTI_ELEMENT_ORDER, order: MULTI_ELEMENT_ORDER, norm: PRIMITIVE_MANTLE_MS95,
  },
};

// [{symbol, value}] normalized ratios for one sample; value is null where data is missing or the
// normalizing value is undefined (spider plot drops that vertex, connecting around the gap).
export function reeProfile(sample, elementUnits, order, norm) {
  return order.map((sym) => {
    const v = valueIn(sample, sym, "ppm", elementUnits);
    const n = norm[sym];
    if (v == null || !n) return { symbol: sym, value: null };
    return { symbol: sym, value: v / n };
  });
}

// ---------- alteration / litho classification (reuse projections above) ----------
export const GEOCHEM_METHODS = {
  alteration_boxplot: {
    label: "Ishikawa AI / CCPI quadrants (Large et al. 2001)",
    target: "alt", requires: ["Na", "K", "Mg", "Ca", "Fe"],
    classify: (v, u, sampleShim) => {
      const s = sampleShim || { values: v };
      const p = DIAGRAMS.boxplot.project(s, u);
      if (!p) return null;
      const { x: CCPI, y: AI } = p;
      if (AI >= 50 && CCPI < 50) return "SER";
      if (AI >= 50 && CCPI >= 50) return "CHL";
      if (AI < 50 && CCPI >= 50) return "EPI";
      return "FRESH";
    },
  },
  litho_winchester: {
    label: "Winchester–Floyd immobile fields",
    target: "litho", requires: ["Zr", "Ti", "Nb", "Y"],
    classify: (v, u, sampleShim) => {
      const s = sampleShim || { values: v };
      const p = DIAGRAMS.winchester.project(s, u);
      if (!p) return null;
      return winchesterClass(p.x, p.y);
    },
  },
  litho_jensen: {
    label: "Jensen cation fields",
    target: "litho", requires: ["Al", "Fe", "Ti", "Mg"],
    classify: (v, u, sampleShim) => {
      const s = sampleShim || { values: v };
      const Al = valueIn(s, "Al", "%", u), Fe = valueIn(s, "Fe", "%", u), Ti = valueIn(s, "Ti", "%", u), Mg = valueIn(s, "Mg", "%", u);
      if ([Al, Fe, Ti, Mg].some((x) => x == null)) return null;
      const alC = toOxide(Al, "Al") / 50.98, feC = toOxide(Fe, "Fe") / 71.85 + toOxide(Ti, "Ti") / 79.87, mgC = toOxide(Mg, "Mg") / 40.30;
      const t = alC + feC + mgC || 1;
      const a = (alC / t) * 100, f = (feC / t) * 100, m = (mgC / t) * 100;
      if (m > 50) return "KOM";
      if (f > m) return a < 60 ? "THOL-FE" : "THOL-MAFIC";
      if (a < 56) return "CA-BASALT";
      if (a < 64) return "CA-AND";
      if (a < 72) return "CA-DAC";
      return "CA-RHY";
    },
  },
};

export const GEOCHEM_LABELS = {
  SER: "Sericite/K-feldspar", CHL: "Chlorite-pyrite", EPI: "Epidote-albite", FRESH: "Weak/fresh",
  KOM: "Komatiite", "THOL-FE": "Fe-tholeiite", "THOL-MAFIC": "Mg-tholeiite", "CA-BASALT": "Calc-alk. basalt",
  "CA-AND": "Calc-alk. andesite", "CA-DAC": "Calc-alk. dacite", "CA-RHY": "Calc-alk. rhyolite",
  BAS: "Basalt", "AND-BAS": "Basaltic andesite", AND: "Andesite", "RHY-DAC": "Rhyolite/Dacite",
  "ALK-BAS": "Alkali basalt", TRACHY: "Trachyte/Trachyandesite", "SUB-ALK": "Subalkaline basalt", FONO: "Phonolite",
};

function winchesterClass(nbY, zrTi) {
  // approximate boundaries of Winchester & Floyd (1977)
  if (nbY < 0.7) {
    if (zrTi < 0.0025) return "SUB-ALK";
    if (zrTi < 0.008) return "AND-BAS";
    if (zrTi < 0.02) return "AND";
    return "RHY-DAC";
  }
  if (zrTi < 0.008) return "ALK-BAS";
  if (zrTi < 0.02) return "TRACHY";
  return "FONO";
}

// ---------- ternary helpers ----------
function ternaryXY(a, f, m) {
  // a at top, f bottom-left, m bottom-right; returns {x:0..1, y:0..1}
  const x = 0.5 * (2 * m + a) / (a + f + m || 1);
  const y = (Math.sqrt(3) / 2) * a / (a + f + m || 1);
  return { x, y };
}

// ---------- reference field polygons (approximate, for visual guidance) ----------
function tasFields() {
  return [
    { name: "Basalt", pts: [[45, 0], [45, 5], [52, 5], [52, 0]] },
    { name: "Basaltic andesite", pts: [[52, 0], [52, 5], [57, 5.9], [57, 0]] },
    { name: "Andesite", pts: [[57, 0], [57, 5.9], [63, 7], [63, 0]] },
    { name: "Dacite", pts: [[63, 0], [63, 7], [69, 8], [77, 0]] },
    { name: "Rhyolite", pts: [[69, 8], [77, 0], [77, 12], [69, 13]] },
    { name: "Trachyte", pts: [[63, 7], [69, 8], [69, 13], [65, 14.5], [57.6, 11.7]] },
    { name: "Trachyandesite", pts: [[57, 5.9], [63, 7], [57.6, 11.7], [53, 9.3], [49.4, 7.3]] },
    { name: "Tephrite/Basanite", pts: [[41, 3], [45, 5], [49.4, 7.3], [45, 9], [41, 7]] },
    { name: "Phonolite", pts: [[52.5, 14], [57.6, 11.7], [65, 14.5], [60, 16]] },
    { name: "Picrobasalt", pts: [[41, 0], [41, 3], [45, 3], [45, 0]] },
  ];
}
function winchesterFields() {
  // drawn in log space by the renderer; these are boundary polylines in (Nb/Y, Zr/TiO2)
  return [
    { name: "Rhyolite/Dacite", box: [[0.7, 0.02], [0.02, 0.1]] },
    { name: "Andesite", box: [[0.7, 0.008], [0.02, 0.02]] },
    { name: "Bas-And", box: [[0.7, 0.0025], [0.02, 0.008]] },
    { name: "Subalkaline basalt", box: [[0.7, 0.0001], [0.02, 0.0025]] },
    { name: "Alkali basalt", box: [[10, 0.0001], [0.7, 0.008]] },
    { name: "Trachyandesite", box: [[10, 0.008], [0.7, 0.02]] },
    { name: "Phonolite", box: [[10, 0.02], [0.7, 0.1]] },
  ];
}
function afmDivider() {
  // Irvine & Baragar (1971) tholeiitic/calc-alkaline dividing line, in A-F-M fractions -> xy
  const raw = [
    [0.0, 0.6, 0.4], [0.05, 0.62, 0.33], [0.1, 0.63, 0.27], [0.18, 0.6, 0.22],
    [0.28, 0.53, 0.19], [0.4, 0.44, 0.16], [0.5, 0.36, 0.14], [0.62, 0.26, 0.12], [0.78, 0.13, 0.09],
  ];
  return raw.map(([a, f, m]) => ternaryXY(a, f, m));
}

export const CLASS_COLORS = {
  SER: "#d4b06a", CHL: "#4a6b4a", EPI: "#7a9e6a", FRESH: "#5a6472",
  KOM: "#2f6b3d", "THOL-FE": "#7a3d3d", "THOL-MAFIC": "#3d5a4c", "CA-BASALT": "#33502f",
  "CA-AND": "#6b8060", "CA-DAC": "#c98a5a", "CA-RHY": "#d8b06a",
  BAS: "#33502f", "AND-BAS": "#4a6b4a", AND: "#6b8060", "RHY-DAC": "#c98a5a",
  "ALK-BAS": "#7a3d5a", TRACHY: "#a5708a", "SUB-ALK": "#3d5a6b", FONO: "#8a6fae",
};
export function classColor(code) { return CLASS_COLORS[code] || "#8a95a5"; }

// TASKS.csv #1083 / #1017 — the rows of the composite and best-intercept CSV reports, moved out of their dialogs
// (CompositingModal.jsx, BestIntercepts.jsx) so a Node test can check the columns and number formats. Pure: results
// and settings in, one plain object per CSV row out (toExportCsv in tabular.js writes them).
import { intervalXYZ } from "./desurvey.js";
import { interceptGradeLength, interceptSampledM } from "./geochem.js"; // TASKS.csv #2475

// TASKS.csv #1069 — grades to 6 significant figures whatever the unit (toFixed(3) wrote 0.000 for small Mo % values)
export const sig6 = (v) => (Number.isFinite(v) ? +v.toPrecision(6) : "");

// Composites (compositeDownhole results). traces: Map hole_id -> desurveyed trace (from/to/mid XYZ, blank without
// one). domainColumn: the domain layer's label, or null when compositing ignored domains; domainLabel turns a coded
// domain into its name.
export function compositeRows(results, { symbol, unit, traces, domainColumn = null, domainLabel = (v) => v }) {
  return results.map((r) => ({
    hole_id: r.hole_id, from: r.from.toFixed(2), to: r.to.toFixed(2), length_m: r.length.toFixed(2),
    [`avg_${symbol}_${unit}`]: sig6(r.avgGrade),
    coverage_pct: r.coverage == null ? "" : (r.coverage * 100).toFixed(0), // #3567 — blank where the element's window was left out
    conflict_m: (r.conflictLength || 0).toFixed(2), // #532 — metres where overlapping assays disagreed (averaged)
    ...(() => { // #411 — XYZ; blank when the hole has no collar/trace
      const p = intervalXYZ(traces?.get(r.hole_id), r.from, r.to);
      const f = (v) => (p ? v.toFixed(2) : "");
      return { x_mid: p ? f(p.mid.x) : "", y_mid: p ? f(p.mid.y) : "", z_mid: p ? f(p.mid.z) : "", x_from: p ? f(p.from.x) : "", y_from: p ? f(p.from.y) : "", z_from: p ? f(p.from.z) : "", x_to: p ? f(p.to.x) : "", y_to: p ? f(p.to.y) : "", z_to: p ? f(p.to.z) : "" };
    })(),
    ...(domainColumn ? { [domainColumn]: r.domain != null ? domainLabel(r.domain) : "" } : {}),
  }));
}

// Best intercepts (computeBestIntercepts results, with .tw / .dom / .including / .extras attached by the dialog).
// loc(r): the collar and midpoint columns (interceptLocation.js). Optional parts, each only when switched on:
// trueWidth { dipDir, dip }, domain (a layer was chosen), including { cutoff, text(sub) }, extraSymbols + units,
// meq(r) -> metal-equivalent grade or null.
// TASKS.csv #3747 — topCut: undefined = not said (older callers); null = the grades are UNCUT (said in a column); a number = each sample cut to it (stored unit), the cut grade
// and the number of samples cut beside the uncut grade. concentration: the share of each intercept's metal in its two richest samples (from four samples up).
export function interceptRows(results, { symbol, unit, loc = () => ({}), trueWidth = null, domain = false, extraSymbols = [], elementUnits = {}, including = null, meq = null, weighted = false, topCut = undefined, concentration = false }) {
  return results.map((r) => ({
    hole_id: r.hole_id, from: r.from, to: r.to, length_m: r.length.toFixed(2),
    ...loc(r),
    ...(trueWidth ? {
      true_width_m: r.tw ? r.tw.trueWidth.toFixed(2) : "",
      true_width_factor: r.tw ? r.tw.factor.toFixed(3) : "",
      structure_dipdir: trueWidth.dipDir, structure_dip: trueWidth.dip,
    } : {}),
    ...(domain ? {
      host_domain: r.dom?.dominant?.value ?? "",
      host_domain_pct: r.dom?.dominant ? Math.round(r.dom.dominant.fraction * 100) : "",
      host_domain_all: r.dom ? r.dom.parts.map((p) => `${p.value}:${Math.round(p.fraction * 100)}%`).join(" | ") : "",
      host_domain_logged_pct: r.dom ? Math.round(r.dom.covered * 100) : "",
      host_domain_log_overlaps: r.dom?.overlapping ? "yes" : "",
    } : {}),
    [`avg_${symbol}_${unit}`]: sig6(r.avgGrade),
    ...(topCut === undefined ? {} : topCut == null ? { grade_top_cut: "none (uncut)" } : { grade_top_cut: `${topCut} ${unit} per sample (the avg_${symbol}_${unit} column is uncut)`, [`avg_${symbol}_${unit}_cut`]: r.cutGrade == null ? "" : sig6(r.cutGrade), samples_cut: r.cutN ?? 0 }), // #3747
    ...(concentration ? { metal_in_top2_samples_pct: r.concentration ? Math.round(r.concentration.top2 * 100) : "" } : {}), // #3747
    // TASKS.csv #3562 — with the grade weighted by length x density: how each row was weighted, the length-weighted grade beside it, the density and the metres with none
    ...(weighted ? { grade_weighting: r.weighting === "density" ? "length x density" : "length (no density here)", [`avg_${symbol}_${unit}_by_length`]: sig6(r.avgGradeByLength ?? r.avgGrade), mean_density_t_m3: r.meanDensity == null ? "" : sig6(r.meanDensity), assayed_m_without_density: r.noDensityM ? r.noDensityM.toFixed(2) : "0" } : {}),
    // TASKS.csv #331/#332/#402 — what the grade figure is built from, carried into the report itself
    grade_is_minimum: r.overRange ? "yes (contains an over-range '>' result read at its ceiling)" : "",
    unsampled_or_unassayed_m: r.unsampledM ? r.unsampledM.toFixed(2) : "0",
    overlapping_assays_averaged_m: r.overlapM ? r.overlapM.toFixed(2) : "0",
    grade_x_length: sig6(interceptGradeLength(r)), // #2475 — over the sampled metres
    sampled_m: sig6(interceptSampledM(r)),
    ...Object.fromEntries(extraSymbols.map((s) => [`avg_${s}_${elementUnits[s] || "ppm"}`, r.extras?.[s] == null ? "" : sig6(r.extras[s])])),
    assay_intervals: r.intervals,
    // TASKS.csv #402 — including sub-intercepts: the best one in columns, all of them as text
    ...(including ? {
      including_cutoff: including.cutoff,
      including_from: r.including ? r.including[0].from : "", including_to: r.including ? r.including[0].to : "",
      including_length_m: r.including ? r.including[0].length.toFixed(2) : "",
      [`including_avg_${symbol}_${unit}`]: r.including ? sig6(r.including[0].avgGrade) : "",
      including_all: r.including ? r.including.map(including.text).join("; ") : "",
    } : {}),
    ...(meq ? { [`${symbol}Eq_${unit}`]: (() => { const v = meq(r); return v == null ? "" : sig6(v); })() } : {}),
  }));
}

// TASKS.csv #3699 (Fireweed rehearsal, round 3) — with 'Total per hole' ticked the table on screen is one row a hole, and 'Export report (CSV)' wrote the
// single intercepts. The per-hole table as a CSV, the screen's columns in its order: the hole, its intercepts, their total downhole length, grade x length
// (in the unit shown, over the sampled metres), the mean grade, and each 'Also show' element's mean, with the weighting named as the interval table does.
// holes: holeTotalsDisplay's rows ({ hole_id, intercepts, thicknessM, gt, meanGrade, extras }), already in the unit shown. extraUnitOf(s) / extraValueOf(s, v): the
// element's unit and its value as the screen shows it. -> one plain object a hole
export function holeTotalRows(holes, { symbol, dispUnit, weighted = false, extraSymbols = [], extraUnitOf = () => "ppm", extraValueOf = (s, v) => v }) {
  return (holes || []).map((h) => ({
    hole_id: h.hole_id, intercepts: h.intercepts, total_length_m_downhole: sig6(h.thicknessM),
    [`grade_x_length_${dispUnit}_m`]: sig6(h.gt),
    [`avg_${symbol}_${dispUnit}`]: h.meanGrade == null ? "" : sig6(h.meanGrade),
    ...(weighted ? { grade_weighting: "length x density" } : {}),
    ...Object.fromEntries((extraSymbols || []).map((s) => [`avg_${s}_${extraUnitOf(s)}`, h.extras?.[s] == null ? "" : sig6(extraValueOf(s, h.extras[s]))])),
  }));
}

// TASKS.csv #1164, #1290 — the optional columns of the Best intercepts table, one order for its header and its rows
export const optionalInterceptColumns = ({ including, metalEquivalent }) => [...(including ? ["including"] : []), ...(metalEquivalent ? ["meq"] : [])];

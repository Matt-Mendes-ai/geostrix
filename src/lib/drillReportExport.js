// TASKS.csv #1083 / #1017 — the rows of the composite and best-intercept CSV reports, moved out of their dialogs
// (CompositingModal.jsx, BestIntercepts.jsx) so a Node test can check the columns and number formats. Pure: results
// and settings in, one plain object per CSV row out (toExportCsv in tabular.js writes them).
import { intervalXYZ } from "./desurvey.js";

// TASKS.csv #1069 — grades to 6 significant figures whatever the unit (toFixed(3) wrote 0.000 for small Mo % values)
export const sig6 = (v) => (Number.isFinite(v) ? +v.toPrecision(6) : "");

// Composites (compositeDownhole results). traces: Map hole_id -> desurveyed trace (from/to/mid XYZ, blank without
// one). domainColumn: the domain layer's label, or null when compositing ignored domains; domainLabel turns a coded
// domain into its name.
export function compositeRows(results, { symbol, unit, traces, domainColumn = null, domainLabel = (v) => v }) {
  return results.map((r) => ({
    hole_id: r.hole_id, from: r.from.toFixed(2), to: r.to.toFixed(2), length_m: r.length.toFixed(2),
    [`avg_${symbol}_${unit}`]: sig6(r.avgGrade),
    coverage_pct: (r.coverage * 100).toFixed(0),
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
export function interceptRows(results, { symbol, unit, loc = () => ({}), trueWidth = null, domain = false, extraSymbols = [], elementUnits = {}, including = null, meq = null }) {
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
    // TASKS.csv #331/#332/#402 — what the grade figure is built from, carried into the report itself
    grade_is_minimum: r.overRange ? "yes (contains an over-range '>' result read at its ceiling)" : "",
    unsampled_or_unassayed_m: r.unsampledM ? r.unsampledM.toFixed(2) : "0",
    overlapping_assays_averaged_m: r.overlapM ? r.overlapM.toFixed(2) : "0",
    grade_x_length: sig6(r.avgGrade * r.length),
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

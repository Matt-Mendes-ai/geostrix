// TASKS.csv #3962 (P2) — the suggested drill program as a CSV, under the provenance header every GeoStrix export carries (provenance.js:
// not a Mineral Resource estimate). English, as every export file is. Pure: DrillProgramSection.jsx saves what this returns.
import { toExportCsv } from "../tabular.js";
import { stampLines, withStamp } from "../provenance.js";
import { fmt } from "./predictionInputs.js";

// rows: [{ h (selectProgram's hole), pred (its 200-run prediction) }]; names: the suggested hole names; why(h) and padName(id): English
export function programCsvText({ rows, names, above, money, cur, unit, type, why, padName, rule, ruleName, kappa, source, model, rules, step, target, version, epsg }) {
  const p4 = (x) => (x == null || !Number.isFinite(x) ? "" : +x.toPrecision(4));
  const csv = toExportCsv(rows.map(({ h, pred }, i) => {
    const ok = pred && !pred.beyond;
    return {
      order: h.order, suggested_name: names[i] ?? "", pad: padName(h.pad), easting: +h.x.toFixed(2), northing: +h.y.toFixed(2), elevation: +h.z.toFixed(2), azimuth_grid: h.azimuth, dip: h.dip, length_m: h.length, hole_type: type || "",
      [money ? `cost_${cur}` : "cost_m"]: Math.round(h.cost), [money ? `cumulative_cost_${cur}` : "cumulative_m"]: Math.round(h.cumCost), cumulative_metres: h.cumMetres,
      p_hit: ok ? +pred.pHit.toFixed(3) : "", [`grade_x_m_p10_${unit}`]: ok ? p4(pred.gt[0]) : "", [`grade_x_m_p50_${unit}`]: ok ? p4(pred.gt[1]) : "", [`grade_x_m_p90_${unit}`]: ok ? p4(pred.gt[2]) : "",
      [`grade_x_m_expected_${unit}`]: ok ? p4(pred.gtMean) : "", typical_hit_m: ok && pred.hitLength ? pred.hitLength[1] : "", [`typical_hit_grade_${unit}`]: ok && pred.hitGrade ? +pred.hitGrade[1].toPrecision(3) : "",
      score_per_unit_cost: p4(h.score), above_line: i < above ? "yes" : "no", why: why(h),
    };
  }));
  const lines = stampLines({ tool: "Drill program (suggested)", version, epsg, params: [
    `Rule: ${ruleName}${rule === "balanced" ? ` (kappa ${kappa})` : ""}, per ${money ? cur : "metre"}`,
    `Grade model: ${source.element} (${unit}), ${step} m composites, ${model.n} composites in ${model.holes} holes; normal-score variogram ${model.vg.model}, range ${fmt(model.vg.range)} m, nugget ${Math.round(model.vg.nugget * 100)} % (r2 ${fmt(model.fit.rSquared)})`,
    `Intercepts: cut-off ${rules.cutoff} ${unit}, minimum ${rules.minLength} m, internal dilution ${rules.maxInternalDilution} m; ${target ? `inside "${target}"` : "anywhere the model reaches"}`,
    "Per-hole grade x metres only: no tonnes, no contained metal. The P10-P90 range comes from the hole spacing and the variogram only, not from the geology being wrong.",
    "A suggestion by the rule above, not an optimum: the geologist decides.",
  ] });
  return withStamp(csv, lines);
}

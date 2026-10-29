// TASKS.csv #1083 / #1017 — the rows of the analysis-panel CSVs, moved out of their dialogs so a Node test can check
// them: QAQC (standards, blanks, duplicates), grade statistics, surface-sample thresholds, the correlation matrix, the
// isocon mass balance and the project report. Pure: results in, CSV rows out (toExportCsv in tabular.js writes them).
// The provenance stamps stay with the dialogs, which know the settings.
import { valueIn } from "./geochem.js";
import { robustZ } from "./thresholds.js";

// QAQC — a standard's series, the blanks, the duplicate pairs
export function qaqcStandardRows(points, standardId, symbol) {
  return points.map((p) => ({ standard: standardId, hole_id: p.hole_id, from: p.from, to: p.to, [symbol]: p.value, outside_2sd: p.outside2sd, outside_3sd: p.outside3sd }));
}
export function qaqcBlankRows(blanks, symbol, limit) {
  return blanks.map((b) => ({ hole_id: b.hole_id, from: b.from, to: b.to, [symbol]: b.value, threshold: limit, flagged: b.flagged }));
}
// kindLabels: duplicate type -> its name; limitOf(d): the RPD limit for that pair's type
export function qaqcDuplicateRows(dups, kindLabels, limitOf) {
  return dups.map((d) => ({ original_hole: d.original_hole, duplicate_hole: d.duplicate_hole, from: d.from, to: d.to, original_value: d.v1, duplicate_value: d.v2, rpd_pct: d.rpd.toFixed(2), duplicate_type: kindLabels[d.kind], rpd_limit_pct: limitOf(d), counted: !d.belowLimit, within_limit: !d.belowLimit && d.rpd <= limitOf(d) }));
}

// Grade statistics per domain — TASKS.csv #1099: the unit in the column names. label(key): a domain's name.
export function gradeStatsRows(groups, { unit, label = (k) => k, weighted }) {
  const u = String(unit).replace(/[^\w]+/g, "_");
  return groups.map((g) => ({
    domain: label(g.key),
    n: g.stats.n, [`mean_${u}`]: g.stats.mean.toFixed(4), [`median_${u}`]: g.stats.median.toFixed(4),
    [`stdev_${u}`]: g.stats.stdev.toFixed(4), cv_pct: g.stats.cv == null ? "" : g.stats.cv.toFixed(1),
    [`min_${u}`]: g.stats.min.toFixed(4), [`max_${u}`]: g.stats.max.toFixed(4), [`q1_${u}`]: g.stats.q1.toFixed(4), [`q3_${u}`]: g.stats.q3.toFixed(4),
    basis: weighted ? "length-weighted (assay interval length)" : "unweighted arithmetic",
  }));
}

// Surface-sample thresholds: every sample with a positive value, its population, robust z, threshold and verdict.
// pops: populations() output; keyOf(sample): its population key; method / methodLabel: the threshold rule.
export function thresholdRows(samples, { symbol, unit, units, pops, keyOf, method, methodLabel }) {
  const byKey = new Map(pops.map((p) => [p.key, p]));
  return samples.map((s) => {
    const v = valueIn(s, symbol, unit, units);
    if (!(v > 0)) return null;
    const p = byKey.get(keyOf(s));
    const t = p?.cand.values[method] ?? null, z = p ? robustZ(v, p.summary) : null;
    return { sample_id: s.sample_id, x: s.x, y: s.y, medium: s.medium, population: p ? p.key : "", [`${symbol}_${unit}`]: v, below_detection: s.bdl?.includes(symbol) ? "yes" : "",
      robust_z: z == null ? "" : z.toFixed(2), threshold: t == null ? "" : t, rule: methodLabel, anomalous: t == null ? "" : v >= t ? "yes" : "no" };
  }).filter(Boolean);
}

// Correlation matrix: r to 3 dp (blank where too few pairs), then the pairwise n block
export function correlationRows(symbols, matrix) {
  const rows = symbols.map((a) => {
    const row = { element: a };
    symbols.forEach((b) => { row[b] = matrix[a][b].r == null ? "" : matrix[a][b].r.toFixed(3); });
    return row;
  });
  const nRows = symbols.map((a) => { const row = { element: `n: ${a}` }; symbols.forEach((b) => { row[b] = matrix[a][b].n; }); return row; });
  return { rows, nRows };
}

// Isocon mass balance, one row per element
export function isoconRows(table) {
  return table.map((r) => ({
    element: r.symbol, precursor_ppm: r.precursor.toFixed(3), altered_ppm: r.altered.toFixed(3),
    ratio_altered_precursor: r.ratio.toFixed(4), mass_change_pct: r.pct.toFixed(1), used_as_immobile: r.isImmobile ? "yes" : "no",
  }));
}

// The project report: sections of plain rows (arrays), each under a [TITLE] line ("=== TITLE ===" until #1083: a
// leading "=" is a formula to a spreadsheet, so the CSV writer had to escape it as '=== ...). report: { totalMetres, layerCounts, assayStats, surfaceStats,
// mediumCounts, qaqcExcluded }; generated: the timestamp text.
export function projectReportRows({ project, collars, surfaceSampleCount, report, generated }) {
  const rows = [];
  rows.push(["[PROJECT]"]);
  rows.push(["Name", project.name || "Untitled project"]);
  rows.push(["EPSG", project.epsg ?? ""]);
  rows.push(["Generated", generated]);
  rows.push(["Drillholes", collars.length]);
  rows.push(["Total metres drilled", report.totalMetres.toFixed(1)]);
  rows.push(["Surface samples", surfaceSampleCount]);
  rows.push([]);

  rows.push(["[DRILLHOLES]"]);
  rows.push(["hole_id", "x", "y", "z", "azimuth", "dip", "length"]);
  collars.forEach((c) => rows.push([c.hole_id, c.x, c.y, c.z, c.azimuth ?? "", Number.isFinite(c.dip) ? -c.dip : "", c.length ?? ""])); // #1033 — dip negative = down, as imported
  rows.push([]);

  if (report.layerCounts.length) {
    rows.push(["[LAYER ROW COUNTS]"]);
    rows.push(["Layer", "Rows"]);
    report.layerCounts.forEach((l) => rows.push([l.label, l.count]));
    rows.push([]);
  }

  if (report.assayStats.length) {
    rows.push(["[ASSAY STATISTICS (length-weighted mean; QAQC inserts excluded; all domains combined; not composited or capped)]"]);
    rows.push(["QAQC rows excluded", report.qaqcExcluded]);
    rows.push(["Element", "Unit", "n", "Metres", "Length-weighted mean", "Min", "Max", "Intervals without a usable length (not in the mean)"]);
    report.assayStats.forEach((s) => rows.push([s.symbol, s.unit, s.n, s.metres, s.mean, s.min, s.max, s.noLength]));
    rows.push([]);
  }

  if (Object.keys(report.mediumCounts).length) {
    rows.push(["[SURFACE SAMPLES BY MEDIUM]"]);
    rows.push(["Medium", "Count"]);
    Object.entries(report.mediumCounts).forEach(([m, n]) => rows.push([m, n]));
    rows.push([]);
  }

  if (report.surfaceStats.length) {
    rows.push(["[SURFACE SAMPLE STATISTICS (unweighted mean; all media combined)]"]);
    rows.push(["Element", "Unit", "n", "Mean", "Min", "Max"]);
    report.surfaceStats.forEach((s) => rows.push([s.symbol, s.unit, s.n, s.mean, s.min, s.max]));
  }
  return rows;
}

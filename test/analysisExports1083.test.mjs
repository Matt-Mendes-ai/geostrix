// TASKS.csv #1083 / #1017 — QAQC, grade statistics, thresholds, correlation, isocon and project report CSV rows (lib/analysisExports.js).
import test from "node:test";
import assert from "node:assert/strict";
import { qaqcStandardRows, qaqcBlankRows, qaqcDuplicateRows, gradeStatsRows, thresholdRows, correlationRows, isoconRows, projectReportRows } from "../src/lib/analysisExports.js";
import { toExportCsv } from "../src/lib/tabular.js";

test("#1083 QAQC rows: standards, blanks, and duplicates judged against their own type's RPD limit", () => {
  assert.deepEqual(qaqcStandardRows([{ hole_id: "H1", from: 1, to: 2, value: 0.51, outside2sd: true, outside3sd: false }], "OREAS-501", "Au"),
    [{ standard: "OREAS-501", hole_id: "H1", from: 1, to: 2, Au: 0.51, outside_2sd: true, outside_3sd: false }]);
  assert.deepEqual(qaqcBlankRows([{ hole_id: "BLK", from: 0, to: 1, value: 0.03, flagged: true }], "Au", 0.025)[0], { hole_id: "BLK", from: 0, to: 1, Au: 0.03, threshold: 0.025, flagged: true });
  const limits = { field: 30, pulp: 10 };
  const rows = qaqcDuplicateRows([
    { original_hole: "H1", duplicate_hole: "H1D", from: 0, to: 1, v1: 1, v2: 1.2, rpd: 18.1818, kind: "field", belowLimit: false },
    { original_hole: "H2", duplicate_hole: "H2D", from: 0, to: 1, v1: 1, v2: 1.2, rpd: 18.1818, kind: "pulp", belowLimit: false },
    { original_hole: "H3", duplicate_hole: "H3D", from: 0, to: 1, v1: 0.001, v2: 0.003, rpd: 100, kind: "pulp", belowLimit: true },
  ], { field: "field duplicate", pulp: "pulp duplicate" }, (d) => limits[d.kind]);
  assert.equal(rows[0].rpd_pct, "18.18");
  assert.equal(rows[0].within_limit, true); // 18 % against the 30 % field limit
  assert.equal(rows[1].within_limit, false); // the same 18 % fails the 10 % pulp limit
  assert.equal(rows[1].duplicate_type, "pulp duplicate");
  assert.deepEqual([rows[2].counted, rows[2].within_limit], [false, false]); // below the pair floor: not counted
});

test("#1083 grade statistics: the unit in the column names, 4 dp, the basis on every row", () => {
  const stats = { n: 12, mean: 1.23456, median: 1.1, stdev: 0.5, cv: 40.4999, min: 0.1, max: 3, q1: 0.7, q3: 1.6 };
  const rows = gradeStatsRows([{ key: "3", stats }, { key: "9", stats: { ...stats, cv: null } }], { unit: "g/t", label: (k) => ({ 3: "Diorite" })[k] || k, weighted: true });
  assert.deepEqual(Object.keys(rows[0]), ["domain", "n", "mean_g_t", "median_g_t", "stdev_g_t", "cv_pct", "min_g_t", "max_g_t", "q1_g_t", "q3_g_t", "basis"]);
  assert.equal(rows[0].domain, "Diorite");
  assert.equal(rows[0].mean_g_t, "1.2346");
  assert.equal(rows[0].cv_pct, "40.5");
  assert.equal(rows[1].cv_pct, "");
  assert.equal(rows[1].basis, "length-weighted (assay interval length)");
  assert.equal(gradeStatsRows([{ key: "a", stats }], { unit: "ppm", weighted: false })[0].basis, "unweighted arithmetic");
});

test("#1083 threshold rows: zero / missing values left out, population threshold and verdict per sample", () => {
  const samples = [
    { sample_id: "S1", x: 1, y: 2, medium: "soil", values: { Cu: 120 }, pop: "A" },
    { sample_id: "S2", x: 3, y: 4, medium: "soil", values: { Cu: 20 }, pop: "A", bdl: ["Cu"] },
    { sample_id: "S3", x: 5, y: 6, medium: "soil", values: { Cu: 0 }, pop: "A" },
    { sample_id: "S4", x: 7, y: 8, medium: "silt", values: { Cu: 50 }, pop: "B" },
  ];
  const pops = [{ key: "A", cand: { values: { p95: 100 } }, summary: { medianL: Math.log10(30), madL: 0.2 } }]; // robust z on log10 values
  const rows = thresholdRows(samples, { symbol: "Cu", unit: "ppm", units: { Cu: "ppm" }, pops, keyOf: (s) => s.pop, method: "p95", methodLabel: "95th percentile" });
  assert.equal(rows.length, 3); // S3 (zero) left out
  assert.deepEqual([rows[0].population, rows[0].Cu_ppm, rows[0].threshold, rows[0].anomalous, rows[0].rule], ["A", 120, 100, "yes", "95th percentile"]);
  assert.ok(rows[0].robust_z !== "" && Number(rows[0].robust_z) > 0);
  assert.deepEqual([rows[1].anomalous, rows[1].below_detection], ["no", "yes"]);
  assert.deepEqual([rows[2].population, rows[2].threshold, rows[2].anomalous, rows[2].robust_z], ["", "", "", ""]); // no population
});

test("#1083 correlation, isocon and project report rows", () => {
  const m = { Cu: { Cu: { r: 1, n: 10 }, Au: { r: 0.12345, n: 8 } }, Au: { Cu: { r: 0.12345, n: 8 }, Au: { r: null, n: 2 } } };
  const { rows, nRows } = correlationRows(["Cu", "Au"], m);
  assert.deepEqual(rows, [{ element: "Cu", Cu: "1.000", Au: "0.123" }, { element: "Au", Cu: "0.123", Au: "" }]);
  assert.deepEqual(nRows[1], { element: "n: Au", Cu: 8, Au: 2 });
  assert.deepEqual(isoconRows([{ symbol: "Zr", precursor: 150, altered: 165.5, ratio: 1.10333, pct: 0.04, isImmobile: true }])[0],
    { element: "Zr", precursor_ppm: "150.000", altered_ppm: "165.500", ratio_altered_precursor: "1.1033", mass_change_pct: "0.0", used_as_immobile: "yes" });
  const report = { totalMetres: 1234.56, layerCounts: [{ label: "Lithology", count: 50 }], assayStats: [], surfaceStats: [], mediumCounts: { soil: 3 }, qaqcExcluded: 0 };
  const pr = projectReportRows({ project: { name: "Test", epsg: 26909 }, collars: [{ hole_id: "H1", x: 1, y: 2, z: 3, azimuth: 45, dip: 60, length: 100 }], surfaceSampleCount: 3, report, generated: "2026-10-29 12:00:00" });
  assert.deepEqual(pr.find((r) => r[0] === "H1"), ["H1", 1, 2, 3, 45, -60, 100]); // dip written negative-down
  assert.deepEqual(pr.find((r) => r[0] === "Total metres drilled"), ["Total metres drilled", "1234.6"]);
  assert.ok(pr.some((r) => r[0] === "[LAYER ROW COUNTS]") && pr.some((r) => r[0] === "[SURFACE SAMPLES BY MEDIUM]"));
  assert.ok(!pr.some((r) => String(r[0]).startsWith("[ASSAY STATISTICS"))); // no assays: no section
  const csv = toExportCsv(pr).split(/\r?\n/);
  assert.equal(csv[0].replace(/,+$/, ""), "[PROJECT]"); // no "0,1,2..." header row, no formula escape
  assert.ok(csv.includes("hole_id,x,y,z,azimuth,dip,length"), csv.slice(8, 12).join(" | "));
});

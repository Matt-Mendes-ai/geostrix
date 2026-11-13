// TASKS.csv #3069 (split from #2912) — Grade stats: the Above cut-off rows in the CSV export, and Best intercepts' cut-off (and the saved
// drill thresholds) offered as cut-offs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeStatsCsvRows, aboveCutoffRows } from "../src/lib/cutoffTable.js";
import { rememberInterceptCutoff, interceptCutoffFor } from "../src/lib/interceptCutoff.js";
import { toExportCsv } from "../src/lib/tabular.js";

const dom = [{ domain: "All", n: 4, mean_pct: "50.0000" }, { domain: "BIF", n: 2, mean_pct: "58.0000", cv_pct: "3.1" }];

test("no cut-off rows: the per-domain table unchanged", () => {
  assert.equal(gradeStatsCsvRows(dom, []), dom);
});

test("the cut-off table follows the domains as its own section", () => {
  const cut = aboveCutoffRows([40, 50, 56, 60], [1, 2, 1, 1], [50, 55], { weighted: true, also: { SiO2: [30, 20, NaN, 6] } });
  const out = gradeStatsCsvRows(dom, cut, { unit: "%", alsoUnits: { SiO2: "%" }, lengths: true, weighted: true });
  assert.deepEqual(out[0], ["domain", "n", "mean_pct", "cv_pct"]);
  assert.deepEqual(out[1], ["All", 4, "50.0000", ""]);
  assert.deepEqual(out[3], []);
  assert.deepEqual(out[4], ["Above cut-off (all domains together)"]);
  assert.deepEqual(out[5], ["cutoff__", "n", "pct_samples", "metres", "pct_metres", "mean__", "mean_SiO2__", "basis"]);
  assert.equal(out[6][0], 50); assert.equal(out[6][1], 3); assert.equal(out[6][3], "4.00"); assert.equal(out[6][4], "80.00");
  assert.equal(out[6][5], "54.0000", "length-weighted: (50×2 + 56 + 60) / 4");
  assert.equal(out[6][6], ((20 * 2 + 6) / 3).toFixed(4), "SiO2 over the samples that have it");
  assert.equal(out[7][0], 55); assert.equal(out[7][1], 2);
  const csv = toExportCsv(out);
  assert.match(csv, /Above cut-off \(all domains together\)/);
  assert.equal(csv.split(/\r?\n/).length, 8);
});

test("surface rows have no metres columns", () => {
  const cut = aboveCutoffRows([1, 2, 3], null, [2]);
  const out = gradeStatsCsvRows(dom, cut, { unit: "ppm" });
  assert.deepEqual(out[5], ["cutoff_ppm", "n", "pct_samples", "mean_ppm", "basis"]);
  assert.deepEqual(out[6], [2, 2, "66.67", "2.5000", "unweighted arithmetic"]);
});

test("Best intercepts' cut-off is kept by project, element and unit, this session", () => {
  rememberInterceptCutoff("P1", "Au", "ppm", 0.5);
  assert.equal(interceptCutoffFor("P1", "Au", "ppm"), 0.5);
  assert.equal(interceptCutoffFor("P2", "Au", "ppm"), null, "another project");
  assert.equal(interceptCutoffFor("P1", "Au", "ppb"), null, "another unit");
  assert.equal(interceptCutoffFor("P1", "Cu", "ppm"), null);
  rememberInterceptCutoff("P1", "Au", "ppm", 0); // nothing to offer
  assert.equal(interceptCutoffFor("P1", "Au", "ppm"), 0.5);
});

test("wiring", () => {
  const B = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(B, /if \(suggested == null \|\| cutoff !== suggested\) rememberInterceptCutoff\(project\?\.name, symbol, unit, cutoff\)/);
  const G = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(G, /gradeStatsCsvRows\(domainRows, cutRows, \{ unit, alsoUnits, lengths: source === "assays", weighted: weightingActive \}\)/);
  assert.match(G, /interceptCutoffFor\(project\?\.name, symbol, unit\)/);
  assert.match(G, /onClick=\{\(\) => addCutoff\(o\.value\)\}/);
});

// TASKS.csv #3699 (Fireweed rehearsal, round 3: Macpass) — with 'Total per hole' ticked, Best intercepts' table is one row a hole, but 'Export report (CSV)'
// wrote the single intercepts. The per-hole table is the file now, the screen's columns in its order, the weighting named, the button saying which it writes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeTotals, holeTotalsDisplay, holeExtraMeans } from "../src/lib/accumulation.js";
import { holeTotalRows } from "../src/lib/drillReportExport.js";
import { toExportCsv } from "../src/lib/tabular.js";

// two holes: NB-1 has two intercepts (2.0 % over 4 m and 4.0 % over 6 m), NB-2 one (1.0 % over 3 m); an Ag mean on each, none on NB-2's
const mk = (hole_id, from, to, avgGrade, ag) => ({ hole_id, from, to, length: to - from, avgGrade, sampledLength: to - from, unsampledM: 0, extras: ag == null ? {} : { Ag: ag }, intervals: 2 });
const results = [mk("NB-1", 10, 14, 2, 10), mk("NB-1", 20, 26, 4, 40), mk("NB-2", 5, 8, 1, null)];

test("#3699 the per-hole table as rows: the screen's columns, in the unit shown, the Also show means, the weighting named when it is on", () => {
  const ex = holeExtraMeans(results, ["Ag"]);
  const holes = holeTotalsDisplay(holeTotals(results), (v) => v).map((h) => ({ ...h, extras: ex.get(h.hole_id) || {} }));
  const rows = holeTotalRows(holes, { symbol: "Zn", dispUnit: "pct", extraSymbols: ["Ag"], extraUnitOf: () => "ppm" });
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]), ["hole_id", "intercepts", "total_length_m_downhole", "grade_x_length_pct_m", "avg_Zn_pct", "avg_Ag_ppm"]);
  assert.deepEqual(rows[0], { hole_id: "NB-1", intercepts: 2, total_length_m_downhole: 10, grade_x_length_pct_m: 32, avg_Zn_pct: 3.2, avg_Ag_ppm: 28 }); // 2x4 + 4x6 = 32 % m over 10 m; Ag 10 x 4 + 40 x 6 over 10
  assert.equal(rows[1].avg_Ag_ppm, ""); // no value for the element: blank, not 0
  const w = holeTotalRows(holes, { symbol: "Zn", dispUnit: "pct", weighted: true });
  assert.equal(w[0].grade_weighting, "length x density");
  assert.ok(!("avg_Ag_ppm" in w[0]));
  assert.deepEqual(holeTotalRows(null, { symbol: "Zn", dispUnit: "pct" }), []);
  // the file's text: a header and a line a hole
  const csv = toExportCsv(rows).trim().split(/\r?\n/);
  assert.equal(csv.length, 3);
  assert.match(csv[1], /^NB-1,2,10,32,3\.2,28$/);
});

test("#3699 the export writes the per-hole table while 'Total per hole' is on, and the button says which table it writes", () => {
  const s = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /if \(perHole && holeRows\.length\) \{/);
  assert.match(s, /best_intercepts_per_hole_\$\{gradeSym\}\.csv/);
  assert.match(s, /\{perHole \? tr\("Export totals per hole \(CSV\)"\) : tr\("Export report \(CSV\)"\)\}/);
  assert.match(s, /Total per hole: each hole's intercepts summed/); // the stamp names it
  // the single-intercept file is still written when the view is off
  assert.match(s, /suggestedName: `best_intercepts_\$\{gradeSym\}\.csv`/);
});

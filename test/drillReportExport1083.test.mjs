// TASKS.csv #1083 / #1017 — the composite and best-intercept CSV rows, now in lib/drillReportExport.js.
import test from "node:test";
import assert from "node:assert/strict";
import { compositeRows, interceptRows, sig6 } from "../src/lib/drillReportExport.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { toExportCsv } from "../src/lib/tabular.js";

// a vertical hole collared at (1000, 2000, 500)
const trace = desurveyHole({ hole_id: "H1", x: 1000, y: 2000, z: 500, azimuth: 0, dip: 90, length: 100 }, []); // desurvey dip: degrees below horizontal
const traces = new Map([["H1", trace]]);

test("#1083 sig6 keeps small grades and blanks non-numbers", () => {
  assert.equal(sig6(0.000123456789), 0.000123457);
  assert.equal(sig6(12345.6789), 12345.7);
  assert.equal(sig6(NaN), "");
  assert.equal(sig6(undefined), "");
});

test("#1083 composite rows: depths to 2 dp, grade to 6 significant figures, XYZ on the trace, blank without one", () => {
  const results = [
    { hole_id: "H1", from: 10, to: 12, length: 2, avgGrade: 0.0004567891, coverage: 0.95, conflictLength: 0.5, domain: 3 },
    { hole_id: "NOPE", from: 0, to: 2, length: 2, avgGrade: 1.5, coverage: 1 },
  ];
  const rows = compositeRows(results, { symbol: "Mo", unit: "pct", traces, domainColumn: "Lithology", domainLabel: (v) => ({ 3: "Diorite" })[v] });
  assert.deepEqual(Object.keys(rows[0]), ["hole_id", "from", "to", "length_m", "avg_Mo_pct", "coverage_pct", "conflict_m", "x_mid", "y_mid", "z_mid", "x_from", "y_from", "z_from", "x_to", "y_to", "z_to", "Lithology"]);
  assert.equal(rows[0].from, "10.00");
  assert.equal(rows[0].avg_Mo_pct, 0.000456789); // not 0.000
  assert.equal(rows[0].coverage_pct, "95");
  assert.equal(rows[0].conflict_m, "0.50");
  assert.deepEqual([rows[0].x_mid, rows[0].y_mid, rows[0].z_mid], ["1000.00", "2000.00", "489.00"]); // 11 m down a vertical hole
  assert.equal(rows[0].z_from, "490.00");
  assert.equal(rows[0].Lithology, "Diorite");
  assert.equal(rows[1].x_mid, ""); // no collar
  assert.equal(rows[1].conflict_m, "0.00");
  assert.equal(rows[1].Lithology, "");
  // without domains there is no domain column
  assert.ok(!("Lithology" in compositeRows(results, { symbol: "Mo", unit: "pct", traces })[0]));
});

test("#1083 intercept rows: the optional column groups appear only when switched on", () => {
  const r = { hole_id: "H1", from: 20, to: 30, length: 10, avgGrade: 2.345678912, intervals: 7, overRange: true, unsampledM: 1.25, overlapM: 0,
    extras: { Cu: 1234.56789 }, tw: { trueWidth: 7.071, factor: 0.70711 }, dom: { dominant: { value: "VCL", fraction: 0.8 }, parts: [{ value: "VCL", fraction: 0.8 }, { value: "DACT", fraction: 0.2 }], covered: 1, overlapping: false },
    including: [{ from: 22, to: 24, length: 2, avgGrade: 9.87654321 }] };
  const plain = interceptRows([r], { symbol: "Au", unit: "g/t" })[0];
  assert.deepEqual(Object.keys(plain), ["hole_id", "from", "to", "length_m", "avg_Au_g/t", "grade_is_minimum", "unsampled_or_unassayed_m", "overlapping_assays_averaged_m", "grade_x_length", "assay_intervals"]);
  assert.equal(plain["avg_Au_g/t"], 2.34568);
  assert.equal(plain.grade_x_length, 23.4568);
  assert.match(plain.grade_is_minimum, /^yes/);
  assert.equal(plain.unsampled_or_unassayed_m, "1.25");
  assert.equal(plain.overlapping_assays_averaged_m, "0");
  const full = interceptRows([r], { symbol: "Au", unit: "g/t", loc: () => ({ collar_x: 1000 }), trueWidth: { dipDir: 90, dip: 45 }, domain: true,
    extraSymbols: ["Cu", "Ag"], elementUnits: { Cu: "ppm" }, including: { cutoff: 5, text: (s) => `${s.length} m @ ${s.avgGrade.toFixed(2)}` }, meq: () => 3.1415926 })[0];
  assert.equal(full.collar_x, 1000);
  assert.equal(full.true_width_m, "7.07");
  assert.equal(full.true_width_factor, "0.707");
  assert.equal(full.structure_dip, 45);
  assert.equal(full.host_domain, "VCL");
  assert.equal(full.host_domain_all, "VCL:80% | DACT:20%");
  assert.equal(full.avg_Cu_ppm, 1234.57);
  assert.equal(full.avg_Ag_ppm, ""); // not averaged
  assert.equal(full.including_from, 22);
  assert.equal(full["including_avg_Au_g/t"], 9.87654);
  assert.equal(full.including_all, "2 m @ 9.88");
  assert.equal(full["AuEq_g/t"], 3.14159);
  // the whole thing goes through the shared CSV writer
  const csv = toExportCsv([full]);
  assert.match(csv.split(/\r?\n/)[0], /^hole_id,from,to,length_m,collar_x,true_width_m/);
});

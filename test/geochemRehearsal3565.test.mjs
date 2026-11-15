// TASKS.csv #3565, #3566, #3568, #3576, #3577, #3579 — the Fireweed / Macpass rehearsal's smaller rows (hand calculations)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sortIntercepts, filterIntercepts, spreadFormat } from "../src/lib/interceptTable.js";
import { holeExtraMeans } from "../src/lib/accumulation.js";
import { fitLine, xyStats, ratioMeaningful } from "../src/lib/geochemXY.js";
import { CALC_PRESETS } from "../src/lib/calcElement.js";
import { attributeDomainOptions } from "../src/lib/customDomains.js";
import { gradeStatsRows } from "../src/lib/analysisExports.js";

const R = (hole, from, to, g, extras = {}) => ({ hole_id: hole, from, to, length: to - from, avgGrade: g, unsampledM: 0, intervals: 3, extras });
const rows = [R("NB23-010", 5, 9, 2), R("NB23-007", 58, 60, 12), R("NB23-007", 10, 20, 4), R("NB23-002", 1, 3, 20)];
rows.stats = { duplicatesSkipped: 1 };

test("#3565 sort on a heading: hole then depth, any column, ties by hole and depth, stats kept", () => {
  assert.deepEqual(sortIntercepts(rows, "hole", false).map((r) => `${r.hole_id}@${r.from}`), ["NB23-002@1", "NB23-007@10", "NB23-007@58", "NB23-010@5"]);
  assert.deepEqual(sortIntercepts(rows, "hole", true).map((r) => r.hole_id), ["NB23-010", "NB23-007", "NB23-007", "NB23-002"]);
  assert.deepEqual(sortIntercepts(rows, "grade", true).map((r) => r.avgGrade), [20, 12, 4, 2]);
  assert.deepEqual(sortIntercepts(rows, "length", true).map((r) => r.length), [10, 4, 2, 2]);
  assert.deepEqual(sortIntercepts(rows, "gl", true).map((r) => r.avgGrade), [20, 4, 12, 2]); // 40, 40, 24, 8: the tie of NB23-002 (20 x 2) and NB23-007 (4 x 10) goes by hole
  assert.equal(sortIntercepts(rows, "grade", false).stats.duplicatesSkipped, 1);
  assert.equal(rows[0].hole_id, "NB23-010"); // the input is not changed
  const e = [R("A", 0, 1, 1, { Pb: 3 }), R("B", 0, 1, 1, { Pb: null }), R("C", 0, 1, 1, { Pb: 1 })];
  assert.deepEqual(sortIntercepts(e, "extra:Pb", true).map((r) => r.hole_id), ["A", "C", "B"]); // a blank last
  assert.deepEqual(sortIntercepts(e, "extra:Pb", false).map((r) => r.hole_id), ["C", "A", "B"]);
});

test("#3565 the hole filter keeps the holes whose name contains the text, any case", () => {
  assert.equal(filterIntercepts(rows, ""), rows);
  const f = filterIntercepts(rows, "nb23-007");
  assert.deepEqual(f.map((r) => r.hole_id), ["NB23-007", "NB23-007"]); assert.equal(f.stats.duplicatesSkipped, 1);
  assert.equal(filterIntercepts(rows, "zzz").length, 0);
});

test("#3566 'Total per hole' carries the 'Also show' elements, each length-weighted over the hole's intercepts", () => {
  const r = [R("H", 0, 2, 5, { Pb: 1, Ag: 10 }), R("H", 10, 16, 5, { Pb: 3, Ag: null }), R("G", 0, 1, 1, { Pb: 7, Ag: 7 })];
  const m = holeExtraMeans(r, ["Pb", "Ag"]);
  assert.ok(Math.abs(m.get("H").Pb - (1 * 2 + 3 * 6) / 8) < 1e-12); // 2.5
  assert.equal(m.get("H").Ag, 10); // the intercept with no Ag is left out of Ag's mean
  assert.equal(m.get("G").Pb, 7);
});

test("#3579 spreadFormat: decimals from the column's low end", () => {
  const f = spreadFormat([0.006, 0.04867, 0.1, 0.2433, 20.1234, 5, 3, 2, 1, 0.5, 0.2, 0.3, 0.4, 0.7, 0.9, 1.5, 2.5, 3.5, 4.5, 6]);
  assert.equal(f(0.006), "0.006"); assert.equal(f(20.1234), "20.123"); // the 5th percentile of the positive values is 0.04867: two significant figures need 3 decimals
  assert.equal(spreadFormat([0.0004, 0.0005, 0.0006, 0.5])(0.0004), "0.0004"); // a low-grade column keeps its figures, to the cap of 4
  assert.equal(spreadFormat([10, 20, 30])(15), "15"); // two significant figures of 10
  assert.equal(spreadFormat([])(1), "1.00");
});

test("#3568 'Zn + Pb (combined grade)' is a per-cent grade, not an index", () => {
  const p = CALC_PRESETS.find((x) => x.name === "ZnPb");
  assert.equal(p.unit, "%"); assert.deepEqual(p.units, { Zn: "%", Pb: "%" });
});

test("#3577 a least-squares line, the median and mean of Y, and no ratio for a density over a grade", () => {
  const f = fitLine([1, 2, 3, 4], [3, 5, 7, 9]); // y = 2x + 1
  assert.ok(Math.abs(f.slope - 2) < 1e-12 && Math.abs(f.intercept - 1) < 1e-12 && Math.abs(f.r2 - 1) < 1e-12 && f.n === 4);
  assert.equal(fitLine([1, 1, 1], [1, 2, 3]), null); assert.equal(fitLine([1, 2], [1, 2]), null);
  const zn = { label: "Zn (%)", element: true, unit: "%", value: (s) => s.zn }, pb = { label: "Pb (%)", element: true, unit: "%", value: (s) => s.pb };
  const sg = { label: "Specific gravity (g/cc)", unit: "g/cc", value: (s) => s.sg };
  assert.ok(ratioMeaningful(zn, pb)); assert.ok(!ratioMeaningful(zn, sg));
  const samples = [{ zn: 2, sg: 2.8 }, { zn: 10, sg: 3.4 }, { zn: 20, sg: 3.8 }, { zn: 30, sg: 4.0 }];
  const st = xyStats(zn, sg, samples, {});
  assert.equal(st.ratioOk, false); assert.equal(st.n, 4); assert.ok(Math.abs(st.medianY - 3.6) < 1e-12 && Math.abs(st.meanY - 3.5) < 1e-12);
  const hi = xyStats(zn, sg, samples, {}, { xMin: 10 });
  assert.equal(hi.n, 3); assert.ok(Math.abs(hi.medianY - 3.8) < 1e-12);
  assert.ok(st.fit.slope > 0 && st.fit.r2 > 0.9);
});

test("#3579 a field of years is also offered by decade; Grade stats lists years in order; SELECT * omits computed columns (see sqlStar3579)", () => {
  const collars = ["1952", "1963", "1981", "2019", "2023", "2023"].map((y, i) => ({ hole_id: `H${i}`, attrs: { Year: y } }));
  const o = attributeDomainOptions([], collars);
  assert.deepEqual(o.map((d) => d.key), ["collar:Year", "collar:Year:decade"]);
  assert.deepEqual([...new Set(o[1].rows.map((r) => r.value))], ["1950s", "1960s", "1980s", "2010s", "2020s"]);
  const gs = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.ok(gs.includes("/^\\d{4}s?$/.test(String(k))"));
});

test("#3576 Grade stats names the weighting in its headings, shows the plain mean and titles the histogram axes", () => {
  const gs = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  for (const k of ['tr("Mean (length-weighted)")', 'tr("Mean (unweighted)")', 'tr("Median (length-weighted)")', 'tr("Stdev (length-weighted)")', 'data.metres ? tr("metres") : tr("samples")', "capText(prob.p975)"]) assert.ok(gs.includes(k), k);
  const rowsOut = gradeStatsRows([{ key: "All", plainMean: 2.468, stats: { n: 3, mean: 2.006, median: 0.09, stdev: 4.45, cv: 100, min: 0, max: 9, q1: 0, q3: 1.8 } }], { unit: "%", weighted: true });
  assert.equal(Object.entries(rowsOut[0]).find(([k]) => k.startsWith("mean_unweighted"))[1], "2.4680");
});

test("#3564 the density is in Grade stats' Element list (numeric interval layers, density first)", () => {
  const gs = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(gs, /logChoices\.find\(\(c\) => c\.key === symbol\)/);
  assert.match(gs, /Numeric interval layers \(density first\)/);
  assert.match(gs, /a\.key === "log:sg" \? -1/);
});

// TASKS.csv #443 — regression tests for the #330 review's wrong-number fixes (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { computeBestIntercepts, avgGradeInRange, readAssayCell, convertUnit, mergeAssayRows } from "../src/lib/geochem.js";

const U = { Au: "ppm" };
const row = (f, t, v, extra = {}) => ({ hole_id: "H1", from: f, to: t, values: { Au: v }, ...extra });
const one = (rows, opts) => computeBestIntercepts(rows, "Au", "ppm", U, { cutoff: 0.5, ...opts });

test("#331 overlapping re-assay counts each metre once (mean of the overlap)", () => {
  const r = one([row(0, 4, 2), row(1, 2, 5)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].from, 0); assert.equal(r[0].to, 4);
  assert.ok(Math.abs(r[0].avgGrade - 2.375) < 1e-9);
  assert.equal(r[0].overlapM, 1);
});

test("#331 exact duplicate row is counted once", () => {
  const r = one([row(0, 1, 10), row(0, 1, 10), row(1, 2, 1)]);
  assert.ok(Math.abs(r[0].avgGrade - 5.5) < 1e-9);
  assert.equal(r.stats.duplicatesSkipped, 1);
});

test("#332 an intercept never averages below its cutoff", () => {
  const r = one([row(0, 1, 0.5), row(1, 3, 0), row(3, 4, 0.5), row(4, 6, 0), row(6, 7, 0.5)], { maxInternalDilution: 2 });
  for (const i of r) assert.ok(i.avgGrade >= 0.5 - 1e-9, `${i.from}-${i.to} @ ${i.avgGrade}`);
});

test("#333 a -9999 code is never averaged in as a grade", () => {
  const r = one([row(0, 1, 1), row(1, 2, -9999), row(2, 3, 1)]);
  assert.ok(r[0].avgGrade > 0);
  assert.equal(r.stats.negativeValues, 1);
  assert.equal(r[0].unsampledM, 1);
});

test("#402 a '<' value never passes the cutoff; '>' marks a minimum", () => {
  assert.equal(one([row(0, 1, 0.5, { qualifiers: { Au: "<" } })], { cutoff: 0.4 }).length, 0);
  assert.equal(one([row(0, 1, 100, { qualifiers: { Au: ">" } })])[0].overRange, true);
});

test("plain intercept with a gap is unchanged", () => {
  const r = one([row(0, 1, 2), row(1, 2, 0.1), row(3, 4, 3), row(10, 11, 1)], { maxInternalDilution: 2 });
  assert.equal(r.length, 2);
  assert.ok(Math.abs(r[0].avgGrade - 1.275) < 1e-9);
});

test("#331 avgGradeInRange resolves overlaps and duplicates the same way", () => {
  assert.ok(Math.abs(avgGradeInRange([row(0, 4, 2), row(1, 2, 5)], "H1", 0, 4, "Au", "ppm", U) - 2.375) < 1e-9);
  assert.ok(Math.abs(avgGradeInRange([row(0, 1, 10), row(0, 1, 10), row(1, 2, 1)], "H1", 0, 2, "Au", "ppm", U) - 5.5) < 1e-9);
});

test("#333 readAssayCell: negative codes and sentinels", () => {
  assert.deepEqual(readAssayCell("-0.005"), { value: 0.0025, qualifier: "<", kind: "neg_bdl" });
  assert.equal(readAssayCell("-9999").value, null);
  assert.equal(readAssayCell("-0.005", "missing").value, null);
  assert.equal(readAssayCell("<0.01").value, 0.005);
  assert.equal(readAssayCell(">100").qualifier, ">");
});

test("#334 convertUnit", () => {
  assert.equal(convertUnit(500, "ppb", "ppm"), 0.5);
  assert.equal(convertUnit(1.2, "%", "ppm"), 12000);
  assert.equal(convertUnit(null, "ppb", "ppm"), null);
});

test("#336 mergeAssayRows updates in place, keeps other elements, appends new intervals", () => {
  const a = [{ hole_id: "H", from: 0, to: 1, source: "assay", values: { Au: 1 }, qualifiers: { Au: "<" } }];
  const r = mergeAssayRows(a, [{ hole_id: "H", from: 0, to: 1, source: "assay", values: { Au: 2, Cu: 5 } }, { hole_id: "H", from: 1, to: 2, source: "assay", values: { Au: 3 } }]);
  assert.equal(r.merged, 1); assert.equal(r.added, 1);
  assert.deepEqual(r.rows[0].values, { Au: 2, Cu: 5 });
  assert.equal(r.rows[0].qualifiers, undefined);
});

import { isElementColumn, oxideOfHeader, fromOxideHeader, toOxide } from "../src/lib/geochem.js";
test("#403 whole-rock oxide headers are recognised and stored as element wt%", () => {
  assert.equal(isElementColumn("SiO2"), "Si");
  assert.equal(isElementColumn("Al2O3 (%)"), "Al");
  assert.equal(isElementColumn("Fe2O3T_pct"), "Fe");
  assert.equal(isElementColumn("TiO2"), "Ti");
  assert.equal(isElementColumn("TFe2O3"), "Fe");
  assert.equal(isElementColumn("LOI"), false);
  assert.equal(isElementColumn("Ti_ppm"), "Ti");
  assert.equal(oxideOfHeader("Ti_ppm"), null);
  assert.equal(oxideOfHeader("Si_pct"), null);
  // 65 % SiO2 must come back as 65 % SiO2 on a diagram (toOxide), not 139 %
  const si = fromOxideHeader(65, "SiO2");
  assert.ok(Math.abs(toOxide(si, "Si") - 65) < 1e-9);
  // Fe2O3 total -> Fe -> FeO total (diagrams use FeO): 10 % Fe2O3 = 8.998 % FeO
  assert.ok(Math.abs(toOxide(fromOxideHeader(10, "Fe2O3T"), "Fe") - 8.998) < 0.01);
  assert.equal(fromOxideHeader(5, "Cu_ppm"), 5);
});

import { correlate } from "../src/lib/correlation.js";
test("#405 Spearman and log correlation resist a single extreme sample", () => {
  // independent-ish noise plus one shared outlier (a multi-element standard left in)
  const xs = [1, 3, 2, 5, 4, 2, 3, 1, 4, 5, 1000], ys = [4, 1, 5, 2, 3, 3, 1, 5, 2, 4, 1000];
  const raw = correlate(xs, ys, "pearson").r, sp = correlate(xs, ys, "spearman").r;
  assert.ok(raw > 0.99, `raw ${raw}`);        // the outlier alone makes raw Pearson ~1
  assert.ok(Math.abs(sp) < 0.4, `spearman ${sp}`);
  // Spearman equals Pearson on ranks with ties averaged; monotone transform -> 1
  assert.ok(Math.abs(correlate([1, 2, 2, 3], [10, 20, 20, 1000], "spearman").r - 1) < 1e-12);
  // log mode drops non-positive values and reports n
  const lg = correlate([0, 1, 10, 100], [5, 1, 10, 100], "log");
  assert.equal(lg.n, 3); assert.ok(Math.abs(lg.r - 1) < 1e-12);
});

import { attachIncluding } from "../src/lib/geochem.js";
test("#402 'including' sub-intercepts at a higher cutoff sit inside their parent intercept", () => {
  // 20 m at 1 g/t with a 4 m core at 6 g/t (8-12 m)
  const assays = Array.from({ length: 20 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { Au: i >= 8 && i < 12 ? 6 : 1 } }));
  const units = { Au: "ppm" };
  const parents = computeBestIntercepts(assays, "Au", "ppm", units, { cutoff: 0.5, maxInternalDilution: 2 });
  const highs = computeBestIntercepts(assays, "Au", "ppm", units, { cutoff: 3, maxInternalDilution: 2 });
  const [p] = attachIncluding(parents, highs);
  assert.equal(p.length, 20);
  assert.equal(p.including.length, 1);
  assert.equal(p.including[0].from, 8); assert.equal(p.including[0].to, 12);
  assert.ok(Math.abs(p.including[0].avgGrade - 6) < 1e-9);
  assert.ok(Math.abs(p.avgGrade - 2) < 1e-9); // (16*1 + 4*6)/20
  // an intercept identical to its parent is not reported as "including" itself
  assert.equal(attachIncluding(parents, parents)[0].including, undefined);
});

import { metalEquivalent, pricePerGram } from "../src/lib/geochem.js";
test("#402 metal equivalent uses only entered prices and recoveries, with unit conversion", () => {
  const au = { symbol: "Au", unit: "ppm", price: 2000, recovery: 0.9 };
  const ag = { symbol: "Ag", unit: "ppm", price: 25, recovery: 0.8 };
  const cu = { symbol: "Cu", unit: "%", price: 4, recovery: 0.85 };
  // Ag: 80 g/t * 25/2000 * 0.8/0.9 = 0.8889 g/t AuEq
  assert.ok(Math.abs(metalEquivalent({ Au: 1, Ag: 80 }, [au, ag]) - (1 + 80 * (25 / 2000) * (0.8 / 0.9))) < 1e-9);
  // Cu 0.5 %: 5000 g/t * ($4/lb per gram) * 0.85 / ($2000/oz per gram * 0.9)
  const expect = 1 + (5000 * pricePerGram("Cu", 4) * 0.85) / (pricePerGram("Au", 2000) * 0.9);
  assert.ok(Math.abs(metalEquivalent({ Au: 1, Cu: 0.5 }, [au, cu]) - expect) < 1e-9);
  assert.ok(expect > 1.6 && expect < 1.7, `${expect}`); // 0.5% Cu at $4/lb, 85% rec. = $37.5/t = 0.65 g/t Au at $2000/oz, 90% rec.
  assert.equal(metalEquivalent({ Au: 1, Ag: 80 }, [au, { ...ag, price: NaN }]), null);
  assert.equal(metalEquivalent({ Au: 1 }, [au, ag]), null); // missing Ag grade -> no number
});

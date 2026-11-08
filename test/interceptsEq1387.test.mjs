// TASKS.csv #1387 (review #1352, Silvertip) — best intercepts cut on a per-sample metal equivalent, not only on one metal
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withMetalEquivalent, computeBestIntercepts, metalEquivalent } from "../src/lib/geochem.js";

const units = { Ag: "ppm", Zn: "%" };
// Ag $25/oz, Zn $1.25/lb, 90 % recoveries: 1 % Zn = 10,000 g/t x (1.25 / 453.59237) / (25 / 31.1034768) = 34.2857 g/t AgEq
const metals = [{ symbol: "Ag", unit: "ppm", price: 25, recovery: 0.9 }, { symbol: "Zn", unit: "%", price: 1.25, recovery: 0.9 }];
const row = (from, to, Ag, Zn, q) => ({ hole_id: "H1", from, to, values: { Ag, Zn }, ...(q ? { qualifiers: q } : {}) });
// an Ag zone 0-4 m, then a Zn zone 10-18 m with little Ag, background between; one sample with no Zn
const assays = [
  row(0, 2, 180, 0.1), row(2, 4, 90, 0.2), row(4, 10, 1, 0.01),
  row(10, 12, 10, 12), row(12, 14, 9, 14), row(14, 16, 11, 15), row(16, 18, 9, 12.5),
  row(18, 20, 1, 0.02), row(20, 22, 200, null),
];

test("#1387 the per-sample equivalent is the price-weighted sum, in the base element's unit; a sample missing a metal has none", () => {
  const { rows, symbol, units: u } = withMetalEquivalent(assays, metals, units);
  assert.equal(symbol, "AgEq"); assert.equal(u.AgEq, "ppm");
  const zn1 = 10000 * (1.25 / 453.59237) / (25 / 31.1034768);
  assert.ok(Math.abs(zn1 - 34.2857) < 1e-4, String(zn1));
  assert.ok(Math.abs(rows[3].values.AgEq - (10 + 12 * zn1)) < 1e-6);
  assert.equal(rows[3].values.AgEq, metalEquivalent({ Ag: 10, Zn: 12 }, metals));
  assert.equal(rows[8].values.AgEq, null, "no Zn on that sample: no equivalent");
  assert.equal(assays[3].values.AgEq, undefined, "the source rows are not changed");
});

test("#1387 an Ag cutoff misses the Zn zone; the same cutoff on AgEq finds it, and the Ag zone too", () => {
  const ag = computeBestIntercepts(assays, "Ag", "ppm", units, { cutoff: 30, maxInternalDilution: 2, minLength: 1 });
  assert.deepEqual(ag.map((r) => [r.from, r.to]).sort((a, b) => a[0] - b[0]), [[0, 4], [20, 22]]);
  const { rows, symbol, units: u } = withMetalEquivalent(assays, metals, units);
  const eq = computeBestIntercepts(rows, symbol, "ppm", u, { cutoff: 30, maxInternalDilution: 2, minLength: 1 });
  assert.deepEqual(eq.map((r) => [r.from, r.to]).sort((a, b) => a[0] - b[0]), [[0, 4], [10, 18]], "the Ag-only sample at 20-22 m has no Zn, so no AgEq");
  const zone = eq.find((r) => r.from === 10);
  const expect = (10 + 9 + 11 + 9) / 4 + ((12 + 14 + 15 + 12.5) / 4) * (10000 * (1.25 / 453.59237) / (25 / 31.1034768)); // 34.2857 g/t per % Zn
  assert.ok(Math.abs(zone.avgGrade - expect) / expect < 1e-4, `${zone.avgGrade} vs ${expect}`);
});

test("#1387 qualifiers: '>' on any metal makes the equivalent a minimum; '<' only when every metal was below detection", () => {
  const { rows } = withMetalEquivalent([row(0, 1, 5, 30, { Zn: ">" }), row(1, 2, 0.25, 0.005, { Ag: "<", Zn: "<" }), row(2, 3, 0.25, 1, { Ag: "<" })], metals, units);
  assert.deepEqual(rows.map((r) => r.qualifiers?.AgEq), [">", "<", undefined]);
});

test("#1387 the dialog offers it once the equivalent is ready, and labels the grade as the equivalent", () => {
  const src = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("const onEq = cutOnEq && meqReady;"));
  assert.ok(src.includes("withMetalEquivalent(reportAssays, meqMetals, elementUnits)"));
  assert.ok(src.includes('tr("Avg {symbol} ({unit})", { symbol: gradeSym, unit: dispUnit })')); // dispUnit: #1680 (g/t, or % on request)
  assert.ok(src.includes("const meqCol = meqReady && !onEq;"));
});

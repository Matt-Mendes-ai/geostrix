// TASKS.csv #3562 — grades weighted by length x density in intercepts, 'Also show' averages and composites. Every number is a hand calculation.
import test from "node:test";
import assert from "node:assert/strict";
import { computeBestIntercepts, makeRangeAverager, compositeDownhole } from "../src/lib/geochem.js";
import { densityLookup, weightedGrade } from "../src/lib/densityWeight.js";

const eu = { Zn: "%", Pb: "%" };
// one hole, 4 m of 1 m samples: Zn 10, 20, 5, 30 %; densities 3.0, 4.0, 2.8, 4.5 t/m3
const A = [10, 20, 5, 30].map((z, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { Zn: z, Pb: z / 2 } }));
const SG = [3.0, 4.0, 2.8, 4.5].map((v, i) => ({ hole_id: "H1", from: i, to: i + 1, value: v }));

test("#3562 the lookup gives the length-weighted density over a span, null where there is none, and leaves out an impossible value", () => {
  const d = densityLookup([...SG, { hole_id: "H2", from: 0, to: 1, value: 99 }, { hole_id: "H2", from: 1, to: 2, value: "" }]);
  assert.equal(d("H1", 0, 1), 3.0);
  assert.ok(Math.abs(d("H1", 0.5, 1.5) - 3.5) < 1e-12); // half of 3.0, half of 4.0
  assert.ok(Math.abs(d("H1", 0, 4) - (3 + 4 + 2.8 + 4.5) / 4) < 1e-12);
  assert.equal(d("H1", 10, 11), null);
  assert.equal(d("H2", 0, 2), null);
  assert.equal(d.left, 1);
  assert.equal(densityLookup([]), null);
});

test("#3562 weightedGrade: grade x length x density, a part with no density takes the mean of the others", () => {
  // (10 x 1 x 3 + 20 x 1 x 4) / (3 + 4) = 110 / 7
  const g = weightedGrade([{ v: 10, w: 1, rho: 3 }, { v: 20, w: 1, rho: 4 }]);
  assert.ok(Math.abs(g.grade - 110 / 7) < 1e-12 && g.weighted && g.noDensityM === 0);
  // the third part has none: it takes (3 x 1 + 4 x 1) / 2 = 3.5: (30 + 80 + 5 x 2 x 3.5) / (3 + 4 + 7) = 145 / 14
  const h = weightedGrade([{ v: 10, w: 1, rho: 3 }, { v: 20, w: 1, rho: 4 }, { v: 5, w: 2, rho: null }]);
  assert.ok(Math.abs(h.grade - 145 / 14) < 1e-12 && h.noDensityM === 2 && h.noDensityN === 1 && h.meanRho === 3.5);
  // no density anywhere: by length, and says so
  const n = weightedGrade([{ v: 10, w: 1, rho: null }, { v: 20, w: 3, rho: null }]);
  assert.ok(n.grade === 17.5 && !n.weighted);
});

test("#3562 an intercept is weighted by length x density; the limits and the length-weighted grade are unchanged", () => {
  const plain = computeBestIntercepts(A, "Zn", "%", eu, { cutoff: 4, maxInternalDilution: 0, minLength: 0 });
  assert.equal(plain.length, 1);
  assert.ok(Math.abs(plain[0].avgGrade - 65 / 4) < 1e-12); // (10 + 20 + 5 + 30) / 4
  assert.equal(plain[0].weighting, undefined);
  const d = densityLookup(SG);
  const w = computeBestIntercepts(A, "Zn", "%", eu, { cutoff: 4, maxInternalDilution: 0, minLength: 0, densityAt: d });
  // (10 x 3 + 20 x 4 + 5 x 2.8 + 30 x 4.5) / (3 + 4 + 2.8 + 4.5) = (30 + 80 + 14 + 135) / 14.3 = 259 / 14.3
  assert.ok(Math.abs(w[0].avgGrade - 259 / 14.3) < 1e-12);
  assert.equal(w[0].weighting, "density");
  assert.ok(Math.abs(w[0].avgGradeByLength - 65 / 4) < 1e-12);
  assert.equal(w[0].from, plain[0].from); assert.equal(w[0].to, plain[0].to); assert.equal(w[0].noDensityM, 0);
});

test("#3562 a sample with no density is counted, and takes the interval's mean density", () => {
  const d = densityLookup(SG.slice(0, 3)); // the last sample has none
  const w = computeBestIntercepts(A, "Zn", "%", eu, { cutoff: 4, maxInternalDilution: 0, densityAt: d });
  const mean = (3 + 4 + 2.8) / 3; // the length-weighted mean of the three that have one
  const num = 10 * 3 + 20 * 4 + 5 * 2.8 + 30 * mean, den = 3 + 4 + 2.8 + mean;
  assert.ok(Math.abs(w[0].avgGrade - num / den) < 1e-12);
  assert.equal(w[0].noDensityM, 1); assert.equal(w[0].noDensityN, 1);
  // no density at all: the length-weighted grade, said to be by length
  const none = computeBestIntercepts(A, "Zn", "%", eu, { cutoff: 4, densityAt: densityLookup([{ hole_id: "ZZ", from: 0, to: 1, value: 3 }]) });
  assert.equal(none[0].weighting, "length"); assert.ok(Math.abs(none[0].avgGrade - 65 / 4) < 1e-12);
});

test("#3562 'Also show' averages over a window by length x density", () => {
  const d = densityLookup(SG);
  const avg = makeRangeAverager(A, eu, d);
  // Pb = Zn / 2 over 0-2 m: (5 x 3 + 10 x 4) / 7
  assert.ok(Math.abs(avg("H1", 0, 2, "Pb", "%") - 55 / 7) < 1e-12);
  assert.ok(Math.abs(makeRangeAverager(A, eu)("H1", 0, 2, "Pb", "%") - 7.5) < 1e-12); // by length without it
});

test("#3562 a composite is weighted by length x density, and reports its density", () => {
  const d = densityLookup(SG);
  const c = compositeDownhole(A, "Zn", "%", eu, { length: 2, minCoverage: 0.5, densityAt: d });
  assert.equal(c.length, 2);
  assert.ok(Math.abs(c[0].avgGrade - 110 / 7) < 1e-12 && Math.abs(c[0].meanDensity - 3.5) < 1e-12 && c[0].weighting === "density");
  assert.ok(Math.abs(c[1].avgGrade - (14 + 135) / 7.3) < 1e-12);
  const plain = compositeDownhole(A, "Zn", "%", eu, { length: 2 });
  assert.equal(plain[0].avgGrade, 15); assert.equal(plain[0].weighting, undefined);
});

import { compositeSet, compositeLayerRows } from "../src/lib/compositeSet.js";

test("#3575 a short end piece: kept, merged into the composite above, or dropped", () => {
  // 5 m of 1 m samples at 10, 20, 30, 40, 50 %: 2 m composites give 0-2, 2-4 and a 1 m piece 4-5
  const B = [10, 20, 30, 40, 50].map((z, i) => ({ hole_id: "H", from: i, to: i + 1, values: { Zn: z } }));
  const e = { Zn: "%" };
  const keep = compositeDownhole(B, "Zn", "%", e, { length: 2 });
  assert.deepEqual(keep.map((c) => [c.from, c.to, c.avgGrade]), [[0, 2, 15], [2, 4, 35], [4, 5, 50]]);
  const merge = compositeDownhole(B, "Zn", "%", e, { length: 2, shortEnd: "merge", minEnd: 1.5 });
  assert.deepEqual(merge.map((c) => [c.from, c.to, c.avgGrade]), [[0, 2, 15], [2, 5, 40]]); // (30 + 40 + 50) / 3
  const drop = compositeDownhole(B, "Zn", "%", e, { length: 2, shortEnd: "drop", minEnd: 1.5 });
  assert.deepEqual(drop.map((c) => [c.from, c.to]), [[0, 2], [2, 4]]);
  // a piece as long as the limit is kept
  assert.equal(compositeDownhole(B, "Zn", "%", e, { length: 2, shortEnd: "drop", minEnd: 1 }).length, 3);
  const st = {}; compositeDownhole(B, "Zn", "%", e, { length: 2, shortEnd: "merge", minEnd: 1.5, stats: st }); assert.equal(st.shortEndsMerged, 1);
});

test("#3575 windows left out for coverage are counted", () => {
  const C = [{ hole_id: "H", from: 0, to: 0.5, values: { Zn: 4 } }, { hole_id: "H", from: 2, to: 4, values: { Zn: 6 } }];
  const st = {}; const c = compositeDownhole(C, "Zn", "%", { Zn: "%" }, { length: 2, minCoverage: 0.5, stats: st });
  assert.equal(c.length, 1); assert.equal(st.underCovered, 1); // 0-2 held 0.5 m of 2 (25 %)
});

test("#3567 one run composites every element on the same windows, with a coverage per element and the density", () => {
  const E = [
    { hole_id: "H", from: 0, to: 1, values: { Zn: 10, Pb: 1 } }, { hole_id: "H", from: 1, to: 2, values: { Zn: 20, Pb: null } },
    { hole_id: "H", from: 2, to: 3, values: { Zn: 5, Pb: 2 } }, { hole_id: "H", from: 3, to: 4, values: { Zn: null, Pb: 4 } },
  ];
  const eu = { Zn: "%", Pb: "%" };
  const d = densityLookup([3, 4, 2.8, 4.5].map((v, i) => ({ hole_id: "H", from: i, to: i + 1, value: v })));
  const set = compositeSet(E, ["Zn", "Pb"], eu, { length: 2, minCoverage: 0.5 }, d);
  assert.equal(set.length, 2);
  assert.ok(Math.abs(set[0].values.Zn.grade - 15) < 1e-12 && set[0].values.Zn.coverage === 1);
  assert.ok(Math.abs(set[0].values.Pb.grade - 1) < 1e-12 && set[0].values.Pb.coverage === 0.5); // Pb blank on 1-2 m
  assert.ok(Math.abs(set[1].values.Zn.grade - 5) < 1e-12 && set[1].values.Zn.coverage === 0.5);
  assert.ok(Math.abs(set[1].values.Pb.grade - 3) < 1e-12);
  assert.ok(Math.abs(set[0].density - 3.5) < 1e-12 && Math.abs(set[1].density - (2.8 + 4.5) / 2) < 1e-12);
  const rows = compositeLayerRows(set, ["Zn", "Pb"]);
  assert.equal(rows.length, 2); assert.ok(rows[0].value === 15 && rows[0].Pb === 1 && rows[0].coverage_Pb === 50 && rows[0].density === 3.5);
  // the single-element run's windows and grades are the set's
  const one = compositeDownhole(E, "Zn", "%", eu, { length: 2, minCoverage: 0.5 });
  assert.deepEqual(one.map((c) => [c.from, c.to, c.avgGrade]), set.map((r) => [r.from, r.to, r.values.Zn.grade]));
});

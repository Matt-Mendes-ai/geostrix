// TASKS.csv #2506 — no closure check: a sample with 110.9 % Fe2O3 (stored as Fe 77.58 %) passed through every diagram and statistic.
// QAQC > Totals: the major-oxide sum per sample, its spread, a tolerance with no default, oxides over 100 %, and an exclusion every
// QC-aware tool and the diagrams honour.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { majorOxides, sampleOxides, oxideTotals, outsideTolerance, totalsHistogram, setTotalExclusion, MIN_MAJORS } from "../src/lib/oxideTotals.js";
import { excludeQAQC, excludedQAQCIds } from "../src/lib/qaqc.js";

const els = [
  { symbol: "Si", unit: "% SiO2" }, { symbol: "Ti", unit: "% TiO2" }, { symbol: "Al", unit: "% Al2O3" }, { symbol: "Fe", unit: "%" },
  { symbol: "Mn", unit: "% MnO" }, { symbol: "Mg", unit: "% MgO" }, { symbol: "Ca", unit: "% CaO" }, { symbol: "Na", unit: "ppm" },
  { symbol: "K", unit: "% K2O" }, { symbol: "P", unit: "% P2O5" }, { symbol: "Li", unit: "% Li2O" }, { symbol: "AI", unit: "index", calculated: { expr: "x" } },
];
const rock = (fe, extra = {}) => ({ hole_id: "RC1", from: 0, to: 1, values: { Si: 50, Ti: 1, Al: 15, Fe: fe, Mn: 0.2, Mg: 6, Ca: 9, Na: 22253, K: 1, P: 0.2, ...extra } });

test("the majors and their oxides: an oxide basis as stored, an element through its factor, total iron as Fe2O3", () => {
  const m = majorOxides(els);
  assert.deepEqual(m.map((x) => x.oxide), ["SiO2", "TiO2", "Al2O3", "Fe2O3", "MnO", "MgO", "CaO", "Na2O", "K2O", "P2O5"]);
  assert.ok(m.length >= MIN_MAJORS);
  assert.deepEqual(majorOxides([{ symbol: "Fe", unit: "% FeO" }]).map((x) => x.oxide), ["FeO"], "stored as FeO: summed as FeO");
  assert.equal(majorOxides(els.slice(0, 3)).length, 3);
});

test("a sample's sum; Fe 77.58 % is 110.9 % Fe2O3, over 100", () => {
  const m = majorOxides(els);
  const s = sampleOxides(rock(7), m);
  assert.ok(Math.abs(s.oxides.Fe2O3 - 7 * 1.4297) < 1e-3);
  assert.ok(Math.abs(s.oxides.Na2O - 3.0) < 0.01, "22,253 ppm Na is 3.0 % Na2O");
  assert.ok(Math.abs(s.total - (50 + 1 + 15 + 7 * 1.4297 + 0.2 + 6 + 9 + 3.0 + 1 + 0.2)) < 0.02);
  const bad = sampleOxides(rock(77.58), m);
  assert.deepEqual(bad.over100, ["Fe2O3"]);
  assert.ok(bad.oxides.Fe2O3 > 110.9 && bad.oxides.Fe2O3 < 111);
  const part = sampleOxides({ values: { Si: 50 } }, m);
  assert.equal(part.total, null); assert.equal(part.missing.length, 9);
});

test("the spread, the tolerance (no default), the histogram", () => {
  const m = majorOxides(els);
  const assays = [rock(7), rock(8), rock(6), rock(77.58), { hole_id: "X", from: 0, to: 1, values: { Si: 50 } }];
  const r = oxideTotals(assays, m);
  assert.equal(r.n, 4); assert.equal(r.incomplete, 1); assert.equal(r.over100.length, 1);
  assert.ok(r.max > 190, "the iron sample totals far over 100");
  assert.deepEqual(outsideTolerance(r, "", ""), [], "no tolerance typed: nothing listed");
  assert.equal(outsideTolerance(r, "", 105).length, 1);
  assert.equal(outsideTolerance(r, 97, "").length, 3);
  const h = totalsHistogram(r);
  assert.ok(h.bins.length <= 60 && h.bins.reduce((a, b) => a + b, 0) === 4);
});

test("the exclusion: written on the rows, honoured by excludeQAQC, listed as 'oxide total', reversible", () => {
  const a = [rock(7), { ...rock(77.58), from: 1, to: 2 }];
  const on = setTotalExclusion(a, [a[1]], true);
  assert.equal(on.changed, 1); assert.equal(on.assays[1].excluded, "total"); assert.equal(on.assays[0].excluded, undefined);
  assert.equal(excludeQAQC(on.assays).length, 1);
  const ids = excludedQAQCIds(on.assays);
  assert.deepEqual(ids.total, [{ id: "RC1", rows: 1, why: "oxide total" }]);
  assert.deepEqual(ids.standard, []);
  const off = setTotalExclusion(on.assays, [], false);
  assert.equal(off.changed, 1); assert.equal("excluded" in off.assays[1], false);
  assert.equal(excludeQAQC(off.assays).length, 2);
});

test("wired: QAQC's Totals tab with six majors, the diagrams leave excluded samples out", () => {
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /majors\.length >= MIN_MAJORS \? \["totals"\] : \[\]/);
  assert.match(q, /tab === "totals" \? 0 :/, "Export does not export the duplicates from the Totals tab");
  assert.match(q, /<OxideTotalsTab assays=\{assays\} majors=\{majors\} setAssays=\{setAssays \|\| null\}/);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const assaysKept = useMemo\(\(\) => (keptMemo\(\[assays\], "kept", \(\) => )?\(assays\.some\(\(a\) => a\.excluded === "total"\)/ /* keptMemo: #3120 */);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Totals", "Exclude {n} sample(s) from plots and statistics", "{n} oxide value(s) over 100 % (impossible as wt%): {list}."]) assert.ok(d[k], `${l}: ${k}`);
  }
});

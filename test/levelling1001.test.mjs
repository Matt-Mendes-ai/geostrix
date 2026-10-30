// TASKS.csv #1001 — levelling one survey to another: tie samples first, quantile matching as a labelled fallback, a new column.
import { groupOptions } from "../src/lib/thresholds.js";
import test from "node:test";
import assert from "node:assert/strict";
import { surveyKey, surveysOf, tiePairs, fitLevelling, leveller, levellingPreview, writeLevelled, levelledSymbol, basisColumn, MIN_TIES, MIN_STAT } from "../src/lib/levelling.js";

const ref = (i, x, y, v, extra = {}) => ({ sample_id: `R${i}`, medium: "soil", x, y, values: { Cu: v }, ...extra });
const old = (i, x, y, v, extra = {}) => ({ sample_id: `O${i}`, medium: "soil", x, y, values: { Cu: v }, attrs: { source: "RGS 1985" }, ...extra });
const base = { symbol: "Cu", medium: "soil", column: "source", reference: "project samples", survey: "RGS 1985", radiusM: 25 };

test("#1001 surveys: public source, project samples otherwise, or any other column", () => {
  assert.equal(surveyKey(ref(1, 0, 0, 1)), "project samples");
  assert.equal(surveyKey(old(1, 0, 0, 1)), "RGS 1985");
  assert.equal(surveyKey({ attrs: {} }, "year"), "");
  assert.equal(surveyKey({ attrs: { year: 1985 } }, "year"), "1985");
  assert.deepEqual(surveysOf([ref(1, 0, 0, 1), ref(2, 0, 0, 1), old(1, 0, 0, 1)]), [{ key: "project samples", count: 2 }, { key: "RGS 1985", count: 1 }]);
});

test("#1001 tie sites: nearest first, each sample once, within the distance, below-detection results left out", () => {
  const r = [ref(1, 0, 0, 10), ref(2, 500, 0, 10), ref(3, 1000, 0, 10, { bdl: ["Cu"] })];
  const s = [old(1, 5, 0, 5), old(2, 10, 0, 5), old(3, 520, 0, 5), old(4, 1000, 0, 5)];
  const pairs = tiePairs(r, s, "Cu", 25);
  assert.deepEqual(pairs.map((p) => [p.a.sample_id, p.b.sample_id]).sort(), [["R1", "O1"], ["R2", "O3"]]); // O2 lost R1 to the closer O1; O4's partner is below detection
});

test("#1001 tie level: the median ratio, one factor, with its spread; too few ties cannot level", () => {
  const r = [], s = [];
  const noise = [1, 0.9, 1.1, 1, 1.2, 0.8, 1, 1.05];
  noise.forEach((n, i) => { r.push(ref(i, i * 200, 0, 30 * (i + 1))); s.push(old(i, i * 200 + 3, 0, (30 * (i + 1)) / (1.5 * n))); });
  const fit = fitLevelling([...r, ...s], base);
  assert.equal(fit.ties.n, 8);
  assert.ok(Math.abs(fit.ties.factor - 1.5) < 0.05, fit.ties.factor);
  assert.ok(fit.ties.low < fit.ties.factor && fit.ties.high > fit.ties.factor);
  assert.ok(Math.abs(leveller(fit, "ties")(10) - 10 * fit.ties.factor) < 1e-9);
  const few = fitLevelling([...r.slice(0, MIN_TIES - 1), ...s.slice(0, MIN_TIES - 1)], base);
  assert.equal(few.ties.ok, false);
  assert.equal(leveller(few, "ties"), null);
});

// lognormal-ish values from a fixed sequence
const series = (n, mean, spread) => Array.from({ length: n }, (_, i) => { const z = -2 + (4 * (i + 0.5)) / n; return 10 ** (mean + spread * z); });

test("#1001 quantile match: medians meet, and a real anomaly keeps its height over background (not capped at the other's top)", () => {
  const r = series(100, 1.5, 0.2).map((v, i) => ref(i, i * 1000, 5000, v));
  const s = series(100, 1.2, 0.2).map((v, i) => old(i, i * 1000, 0, v)); // the old lab reads a factor 2 low, no site in common
  const anomaly = old(999, 500, 9000, 3000);
  const all = [...r, ...s, anomaly];
  const fit = fitLevelling(all, base);
  assert.equal(fit.ties, null);
  assert.ok(fit.stats.ok);
  const fn = leveller(fit, "quantile");
  const p = levellingPreview(all, fit, "quantile", base);
  assert.ok(Math.abs(Math.log10(p.after.median) - Math.log10(p.reference.median)) < 0.02, JSON.stringify(p));
  // the anomaly is about 190 x the old median: it comes out shifted by the same factor 2, far above the reference's top
  assert.ok(Math.abs(fn(3000) / 3000 - 2) < 0.05, fn(3000));
  assert.ok(fn(3000) > p.reference.max * 10);
  const small = fitLevelling([...r.slice(0, MIN_STAT - 1), ...s.slice(0, 50)], base);
  assert.equal(small.stats.ok, false);
  assert.equal(leveller(small, "quantile"), null);
});

test("#1001 the column: source values untouched, reference as reported, survey adjusted, a basis on each, other media and surveys alone", () => {
  const r = Array.from({ length: 6 }, (_, i) => ref(i, i * 100, 0, 30));
  const s = Array.from({ length: 6 }, (_, i) => old(i, i * 100, 0, 15));
  const silt = { sample_id: "T", medium: "stream sediment", x: 0, y: 0, values: { Cu: 7 }, attrs: { source: "RGS 1985" } };
  const third = { sample_id: "X", medium: "soil", x: 0, y: 9000, values: { Cu: 9 }, attrs: { source: "Other" } };
  const bdlOld = old(50, 9000, 9000, 1, { bdl: ["Cu"] });
  const all = [...r, ...s, silt, third, bdlOld];
  const els = [{ symbol: "Cu", unit: "ppm" }];
  const fit = fitLevelling(all, base);
  assert.ok(Math.abs(fit.ties.factor - 2) < 1e-9);
  const w = writeLevelled(all, els, fit, "ties", base);
  const by = (id) => w.samples.find((x) => x.sample_id === id);
  assert.equal(levelledSymbol("Cu"), "Cu_lev");
  assert.deepEqual(w.elements.map((e) => [e.symbol, e.unit]), [["Cu", "ppm"], ["Cu_lev", "ppm"]]);
  assert.equal(by("O0").values.Cu, 15); // raw kept
  assert.equal(by("O0").values.Cu_lev, 30);
  assert.equal(by("R0").values.Cu_lev, 30);
  assert.equal(by("R0").attrs[basisColumn("Cu")], "reference survey: value as reported");
  assert.match(by("O0").attrs[basisColumn("Cu")], /levelled to project samples: x2, median ratio of 6 tie sites within 25 m/);
  assert.ok(!("Cu_lev" in by("T").values) && !("Cu_lev" in by("X").values));
  assert.deepEqual(by("O50").bdl, ["Cu", "Cu_lev"]); // still flagged below detection
  assert.deepEqual(w.written, { reference: 6, levelled: 7 });
  assert.ok(!groupOptions(w.samples).some((o) => o.value.includes("_lev_basis"))); // an audit column, not a population
  // statistical basis says so; a re-run replaces, never duplicates
  const again = writeLevelled(w.samples, w.elements, fit, "ties", base);
  assert.equal(again.elements.length, 2);
  assert.deepEqual(again.samples.find((x) => x.sample_id === "O50").bdl, ["Cu", "Cu_lev"]);
  const r2 = series(40, 1.5, 0.2).map((v, i) => ref(i, i * 1000, 5000, v)), s2 = series(40, 1.2, 0.2).map((v, i) => old(i, i * 1000, 0, v));
  const fit2 = fitLevelling([...r2, ...s2], base);
  const w2 = writeLevelled([...r2, ...s2], els, fit2, "quantile", base);
  assert.match(w2.samples.find((x) => x.sample_id === "O0").attrs[basisColumn("Cu")], /STATISTICAL quantile match, no tie samples/);
  assert.throws(() => writeLevelled(all, els, fitLevelling(r, base), "ties", base));
});

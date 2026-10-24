// TASKS.csv #841 — anomaly thresholds for surface geochemistry: the robust statistics, every candidate rule against
// closed-form values, the probability-plot break on a known two-population mixture (found
// when the anomalous population is there, not invented when it is not), populations by medium / column / map polygon,
// and the importer keeping descriptive columns and below-detection flags
import test from "node:test";
import assert from "node:assert/strict";
import { normalQuantile, quantileSorted, madScaled, populationSummary, candidateThresholds, twoSegmentBreak, robustZ, groupOptions, groupKeyFn, populations } from "../src/lib/thresholds.js";
import { surfaceAttrColumns, surfaceAttrs } from "../src/lib/geochem.js";

const mixture = (seed, nb, na) => {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  return [...Array.from({ length: nb }, () => 10 ** (Math.log10(30) + 0.2 * g())), ...Array.from({ length: na }, () => 10 ** (Math.log10(300) + 0.15 * g()))];
};

test("#841 normal quantiles, type-7 quantiles and the scaled MAD", () => {
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959964) < 1e-6);
  assert.ok(Math.abs(normalQuantile(0.01) + 2.326348) < 1e-6);
  assert.ok(Math.abs(normalQuantile(0.5)) < 1e-12);
  assert.equal(quantileSorted([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantileSorted([10, 20, 30, 40, 50], 0.9), 46);
  assert.ok(Math.abs(madScaled([1, 2, 3, 4, 100]) - 1.4826) < 1e-12, "MAD ignores the outlier");
});

test("#841 every rule against its closed form on a small exact set", () => {
  const vals = [1, 10, 100, 1000, 10, 10, 100, 10, 1, 100]; // log10: 0 1 2 3 1 1 2 1 0 2
  const s = populationSummary(vals, 2);
  assert.equal(s.n, 10); assert.equal(s.censoredPct, 20);
  const c = candidateThresholds(s).values;
  const L = [0, 0, 1, 1, 1, 1, 2, 2, 2, 3], mean = 1.3, sd = Math.sqrt(L.reduce((a, v) => a + (v - mean) ** 2, 0) / 9);
  assert.ok(Math.abs(c.mean2sd - 10 ** (mean + 2 * sd)) < 1e-9);
  assert.ok(Math.abs(c.median2mad - 10 ** (1 + 2 * 1.4826 * 1)) < 1e-9, "median 1, MAD 1 (log)");
  assert.ok(Math.abs(c.tukey - 10 ** (2 + 1.5 * 1)) < 1e-9, "Q1 1, Q3 2 (log)");
  assert.ok(Math.abs(c.p90 - 190) < 1e-9);
  assert.equal(c.probbreak, null, "under 30 samples: no break");
  assert.ok(!("cnbreak" in c), "concentration-number was dropped (no signal, see thresholds.js)");
});

test("#841 two-segment break on two exact lines", () => {
  const xs = Array.from({ length: 40 }, (_, i) => i), ys = xs.map((x) => (x < 25 ? x : 25 + 5 * (x - 25)));
  const b = twoSegmentBreak(xs, ys, 8);
  assert.equal(b.k, 25); assert.ok(b.sse < 1e-9 && b.sse1 > 100);
});

test("#841 the probability-plot break finds a 5 % anomalous population and stay quiet on a single log-normal one", () => {
  for (const seed of [12345, 777, 4242]) {
    const c = candidateThresholds(populationSummary(mixture(seed, 950, 50), 0)).values;
    assert.ok(c.probbreak > 100 && c.probbreak < 300, `seed ${seed}: probability-plot break ${c.probbreak}`);
    assert.ok(c.median2mad < c.tukey, "robust rules are ordered as expected");
  }
  let quiet = 0;
  for (let seed = 1; seed <= 20; seed++) if (candidateThresholds(populationSummary(mixture(seed * 7919, 1000, 0), 0)).values.probbreak == null) quiet++;
  assert.ok(quiet >= 18, `a break was suggested in ${20 - quiet} of 20 single populations`);
});

test("#841 robust z-score within the population", () => {
  const s = populationSummary(mixture(12345, 950, 50), 0);
  assert.ok(robustZ(300, s) > 3 && Math.abs(robustZ(30, s)) < 0.5);
  assert.equal(robustZ(0, s), null);
});

test("#841 populations by medium, by a file column and by the map polygon a sample falls in", () => {
  const samples = [
    { x: 5, y: 5, medium: "soil", values: { Cu: 20 }, attrs: { Horizon: "B" } },
    { x: 15, y: 5, medium: "soil", values: { Cu: 40 }, attrs: { Horizon: "C" }, bdl: ["Cu"] },
    { x: 5, y: 5, medium: "stream sediment", values: { Cu: 60 } },
    { x: 50, y: 50, medium: "soil", values: { Cu: 0 } },
  ];
  const layer = { id: "g1", name: "Geology", geomType: "polygon", fields: ["UNIT"], features: [
    { parts: [[[0, 0], [10, 0], [10, 10], [0, 10]]], attributes: { UNIT: "basalt" } },
    { parts: [[[10, 0], [20, 0], [20, 10], [10, 10]]], attributes: { UNIT: "granite" } }] };
  const opts = groupOptions(samples, [layer]).map((o) => o.value);
  assert.deepEqual(opts, ["none", "medium", "attr:Horizon", "layer:g1:UNIT"]);
  const run = (by) => populations(samples, { valueOf: (s) => s.values.Cu, censoredOf: (s) => !!s.bdl?.includes("Cu"), keyOf: groupKeyFn(by, [layer]) }).map((p) => [p.key, p.values.length, p.censored]);
  assert.deepEqual(run("medium"), [["soil", 2, 1], ["stream sediment", 1, 0]], "the zero value is left out");
  assert.deepEqual(run("attr:Horizon").sort(), [["(blank)", 1, 0], ["B", 1, 0], ["C", 1, 1]]);
  assert.deepEqual(run("layer:g1:UNIT").sort(), [["basalt", 2, 0], ["granite", 1, 1]]);
});

test("#841 the importer keeps category columns as attrs, not elements, coordinates or running numbers", () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ E: 500000 + i, N: 6e6 + i, ID: `S${i}`, Cu_ppm: String(i), Horizon: i % 2 ? "B" : "C", Lab: "ALS", Comment: `note ${i}`, Year: i < 75 ? "2004" : "2005", Empty: "" }));
  const cols = surfaceAttrColumns(Object.keys(rows[0]), rows, { x: "E", y: "N", sample_id: "ID" }, [{ header: "Cu_ppm", mainHeader: "Cu_ppm" }]);
  assert.deepEqual(cols, ["Horizon", "Lab", "Year"]);
  assert.deepEqual(surfaceAttrs(rows[1], cols), { attrs: { Horizon: "B", Lab: "ALS", Year: "2004" } });
  assert.deepEqual(surfaceAttrs({ Horizon: " " }, ["Horizon"]), {});
});

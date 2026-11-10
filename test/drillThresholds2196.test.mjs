// TASKS.csv #2196 (Matt's decision 2026-11-09) — Thresholds for drill assays: length-weighted, populations by a logged domain, saved apart
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { weightedQuantileSorted, populationSummary, candidateThresholds, populations, intervalLength, drillDomainKeyFn, isSurfaceThreshold } from "../src/lib/thresholds.js";
import { drillThresholdRows } from "../src/lib/analysisExports.js";
import { anomalyClasses } from "../src/lib/anomalyMap.js";

test("weighted quantiles: plotting positions at the middle of each weight", () => {
  // values 1, 2, 3 with weights 1, 1, 2: positions 0.125, 0.375, 0.75
  assert.equal(weightedQuantileSorted([1, 2, 3], [1, 1, 2], 0.5), 2 + (0.5 - 0.375) / (0.75 - 0.375));
  assert.equal(weightedQuantileSorted([1, 2, 3], [1, 1, 2], 0.05), 1);
  assert.equal(weightedQuantileSorted([1, 2, 3], [1, 1, 2], 0.95), 3);
  // equal weights: Hazen (type 5), the median of 1..4 is 2.5
  assert.equal(weightedQuantileSorted([1, 2, 3, 4], [1, 1, 1, 1], 0.5), 2.5);
});

test("a long low-grade interval outweighs short high ones: the weighted median and mean sit lower", () => {
  const values = [0.1, 5, 6, 7], len = [20, 1, 1, 1];
  const eq = populationSummary(values), w = populationSummary(values, 0, len);
  assert.equal(w.weighted, true); assert.equal(w.totalWeight, 23);
  assert.ok(w.median < eq.median); assert.ok(w.meanL < eq.meanL);
  const c = candidateThresholds(w);
  assert.ok(Number.isFinite(c.values.p90) && c.values.p90 <= 7);
  assert.equal(c.prob.points.length, 4);
  assert.ok(c.prob.points[0][0] < c.prob.points[1][0]); // the long interval spreads over the low end of the plot
});

test("drill populations: weights from the interval lengths, domains from the logged layer at the middle depth", () => {
  const assays = [
    { hole_id: "A", from: 0, to: 2, values: { Au: 0.2 } }, { hole_id: "A", from: 2, to: 3, values: { Au: 4 } },
    { hole_id: "B", from: 0, to: 1, values: { Au: 1 } }, { hole_id: "B", from: 5, to: 6, values: { Au: 2 } },
  ];
  const layers = { litho: [{ hole_id: "A", from: 0, to: 10, value: "BIF" }, { hole_id: "B", from: 0, to: 3, value: "Basalt" }] };
  const keyOf = drillDomainKeyFn("litho", layers);
  assert.deepEqual(assays.map(keyOf), ["BIF", "BIF", "Basalt", "(not logged)"]);
  assert.equal(drillDomainKeyFn("none", layers)(assays[0]), "All");
  assert.equal(intervalLength({ from: 2, to: 2 }), null);
  const pops = populations(assays, { valueOf: (a) => a.values.Au, keyOf, weightOf: intervalLength });
  const bif = pops.find((p) => p.key === "BIF");
  assert.deepEqual(bif.weights, [2, 1]); assert.equal(bif.summary.weighted, true);
  const rows = drillThresholdRows(assays, { symbol: "Au", unit: "ppm", units: { Au: "ppm" }, pops: pops.map((p) => ({ ...p, cand: candidateThresholds(p.summary) })), keyOf, method: "p90", methodLabel: "90th percentile" });
  assert.deepEqual(Object.keys(rows[0]).slice(0, 5), ["hole_id", "from", "to", "length_m", "population"]);
  assert.equal(rows[0].length_m, 2); assert.equal(rows[0].weighting, "length");
});

test("a saved drill threshold is kept apart: the surface tools never read it", () => {
  assert.equal(isSurfaceThreshold({ symbol: "Au", source: "drill" }), false);
  assert.equal(isSurfaceThreshold({ symbol: "Au" }), true);
  const samples = Array.from({ length: 40 }, (_, i) => ({ sample_id: `S${i}`, x: i, y: 0, medium: "soil", values: { Au: 1 + i } }));
  const drillOnly = [{ symbol: "Au", source: "drill", method: "p90", values: { All: 2 }, groupBy: "none" }];
  const a = anomalyClasses(samples, { mode: "element", symbol: "Au", scheme: "threshold" }, { units: { Au: "ppm" }, thresholds: drillOnly });
  const b = anomalyClasses(samples, { mode: "element", symbol: "Au", scheme: "threshold" }, { units: { Au: "ppm" }, thresholds: [] });
  assert.deepEqual(JSON.stringify(a?.legend ?? a), JSON.stringify(b?.legend ?? b)); // as if no threshold was saved
  for (const f of ["../src/lib/catchments.js", "../src/components/SurfacePlanMap.jsx"]) assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /source !== "drill"/);
});

test("the toolkit offers the drill source and saves it with its weighting", () => {
  const t = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(t, /aria-label=\{tr\("Threshold source"\)\}/);
  assert.match(t, /\.\.\.\(drill \? \{ source: "drill", weighting: "length" \} : \{\}\)/);
  assert.match(t, /weightOf: intervalLength/);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /disabled=\{!surfaceElements\.length && !\(assays\.length && assayElements\.length\)\}/);
});

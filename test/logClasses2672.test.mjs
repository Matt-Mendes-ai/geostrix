// TASKS.csv #2672 — Grade stats groups the samples by a numeric downhole log's quartiles (the log averaged over each sample's interval)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logClasses, logClassRank, NO_READING } from "../src/lib/logClasses.js";

// a mag-susc log in 0.5 m readings rising down the hole, samples of 1 m; the last two samples sit below the log
const layers = { magsusc: Array.from({ length: 40 }, (_, i) => ({ hole_id: "H", from: i * 0.5, to: i * 0.5 + 0.5, value: i })) };
const choice = { key: "log:magsusc", label: "Mag susc", symbol: "Mag susc", unit: "", field: "value", layerKey: "magsusc" };
const samples = Array.from({ length: 22 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1 }));

test("the samples' own quartiles of the interval-averaged log; below the log: no reading", () => {
  const c = logClasses(choice, { layers, customLayers: [] }, samples);
  assert.ok(c);
  // sample i averages readings 2i and 2i+1: mean 2i + 0.5 for i = 0..19
  assert.equal(c.classOf(samples[0]), c.order[0]);
  assert.equal(c.classOf(samples[19]), c.order[3]);
  assert.equal(c.classOf(samples[21]), NO_READING);
  const counts = new Map();
  for (const s of samples) counts.set(c.classOf(s), (counts.get(c.classOf(s)) || 0) + 1);
  assert.deepEqual(c.order.map((k) => counts.get(k) || 0), [5, 5, 5, 5, 2]);
});

test("too few readings: no classes", () => {
  assert.equal(logClasses(choice, { layers: { magsusc: layers.magsusc.slice(0, 4) }, customLayers: [] }, samples.slice(0, 2)), null);
});

test("the classes list low to high, no reading last", () => {
  const order = ["≥ 30.5", "10.5 – 20.5", NO_READING, "< 10.5", "20.5 – 30.5", "1,000 – 2,000"];
  assert.deepEqual([...order].sort((a, b) => logClassRank(a) - logClassRank(b)), ["< 10.5", "10.5 – 20.5", "20.5 – 30.5", "1,000 – 2,000", "≥ 30.5", NO_READING]);
});

test("wired into Grade stats' domain list", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /const cls = covLog \? logClasses\(covLog, \{ layers: storeLayers, customLayers \}, segs\) : null;/);
  assert.match(g, /<optgroup label=\{tr\("A downhole log, by its quartiles"\)\}>/);
});

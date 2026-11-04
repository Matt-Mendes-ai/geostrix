// TASKS.csv #1820 (review #1646, Kodiak) — percentile classes by a column: populations too small for percentiles are pooled (or left
// unclassed) and named, so a lone 109 ppm tonalite is no longer 'anomalous'
import test from "node:test";
import assert from "node:assert/strict";
import { anomalyClasses, poolSmallPopulations, MIN_POPULATION } from "../src/lib/anomalyMap.js";

const rock = (lith, cu, i) => ({ id: `R${i}`, medium: "rock chip", x: i, y: 0, values: { Cu: cu }, attrs: { Lithology: lith } });
// 13 diorites (one at 5,360 ppm), 12 andesites, and six one- or two-sample lithologies
const samples = [
  ...[40, 55, 70, 90, 120, 150, 180, 220, 260, 300, 380, 450, 5360].map((v, i) => rock("DIO", v, i)),
  ...[20, 30, 35, 45, 60, 75, 85, 95, 110, 130, 160, 200].map((v, i) => rock("AND", v, 20 + i)),
  rock("TON", 109, 40), rock("LMST", 201, 41), rock("SKRN", 241, 42), rock("SS", 301, 43), rock("GND", 120, 44), rock("GND", 414, 45),
];
const cfg = { mode: "element", symbol: "Cu", scheme: "percentile", groupBy: "attr:Lithology" };

test("#1820 the one- and two-sample lithologies are pooled (6 samples < 10: left unclassed) and named; the diorite high is the top class", () => {
  const a = anomalyClasses(samples, cfg, { units: { Cu: "ppm" } });
  const at = (id) => a.classOf[samples.findIndex((s) => s.id === id)];
  assert.equal(at("R40"), -1, "TON 109 ppm: unclassed, not '98th percentile and above'");
  assert.equal(at("R12"), a.classes.length - 1, "DIO 5,360 ppm: the top class of its own population");
  const note = a.notes.map((n) => n.text).join(" ");
  assert.match(note, /left unclassed/);
  assert.match(JSON.stringify(a.notes), /TON/);
});

test("#1820 pooling: small groups that reach the minimum together form one population", () => {
  const mk = (key, n) => ({ key, values: Array.from({ length: n }, (_, i) => i + 1), idx: Array.from({ length: n }, (_, i) => i), censored: 0 });
  const r = poolSmallPopulations([mk("A", 30), mk("B", 6), mk("C", 5)]);
  assert.deepEqual(r.pops.map((p) => [p.key, p.values.length]), [["A", 30], ["(small groups pooled)", 11]]);
  assert.deepEqual([r.pooled, r.unclassed], [["B", "C"], []]);
  assert.ok(r.pops[1].summary && r.pops[1].summary.n === 11);
  const none = poolSmallPopulations([mk("A", 30)]);
  assert.deepEqual([none.pops.length, none.pooled, none.unclassed], [1, [], []]);
  assert.equal(MIN_POPULATION, 10);
});

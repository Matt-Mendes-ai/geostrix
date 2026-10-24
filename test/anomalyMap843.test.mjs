// TASKS.csv #843 — anomaly maps of surface samples: classes from a saved threshold or percentiles, within populations;
// a pathfinder index (mean robust z) that rewards several elements agreeing; the coherence check that marks a lone
// spike; and the legend that carries the rule
import test from "node:test";
import assert from "node:assert/strict";
import { anomalyClasses, anomalyLegendGroup, PATHFINDER_PRESETS } from "../src/lib/anomalyMap.js";

function grid(seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const out = [];
  for (let x = 0; x <= 1000; x += 50) for (let y = 0; y <= 1000; y += 50) {
    const cluster = Math.abs(x - 500) <= 50 && Math.abs(y - 500) <= 50, spike = x === 100 && y === 900;
    out.push({ x, y, medium: x < 500 ? "soil" : "talus fines", values: { Cu: cluster || spike ? 300 * 10 ** (0.05 * g()) : 30 * 10 ** (0.15 * g()), Mo: cluster ? 20 : 2 * 10 ** (0.15 * g()), Au: cluster ? 60 : 5 * 10 ** (0.2 * g()), Ag: 0.2 * 10 ** (0.15 * g()) } });
  }
  return out;
}
const units = { Cu: "ppm", Mo: "ppm", Au: "ppb", Ag: "ppm" };
const idxOf = (S, x, y) => S.findIndex((s) => s.x === x && s.y === y);

test("#843 every preset names real element symbols and a reference", () => {
  for (const p of PATHFINDER_PRESETS) {
    assert.ok(p.elements.length >= 4 && p.elements.every((e) => /^[A-Z][a-z]?$/.test(e)) && p.ref, p.id);
  }
});

test("#843 saved-threshold classes per population, recomputed for a population the saved rule did not have", () => {
  const S = grid();
  const thr = [{ symbol: "Cu", unit: "ppm", groupBy: "medium", groupLabel: "Sampling medium", method: "median2mad", methodLabel: "Median + 2 MAD (log)", ref: "Reimann et al. 2005", values: { soil: 150 }, decided: "2026-10-24" }];
  const a = anomalyClasses(S, { mode: "element", symbol: "Cu", scheme: "threshold" }, { units, thresholds: thr });
  assert.equal(a.classes.length, 3);
  assert.equal(a.classOf[idxOf(S, 100, 900)], 2, "the spike is above the soil threshold");
  assert.ok(a.classOf[idxOf(S, 0, 0)] < 2);
  assert.match(a.label, /^Cu \(ppm\): Median \+ 2 MAD \(log\) \(Reimann et al\. 2005\), populations by sampling medium, decided 2026-10-24$/);
  assert.ok(a.notes.some((n) => n.params?.pop === "talus fines"), "talus fines threshold recomputed and said so");
  assert.equal(a.classOf[idxOf(S, 500, 500)], 2, "the cluster (talus side) is anomalous by the recomputed rule");
});

test("#843 without a saved threshold the classes fall back to percentiles, and say so", () => {
  const S = grid();
  const a = anomalyClasses(S, { mode: "element", symbol: "Cu", scheme: "threshold" }, { units, thresholds: [] });
  assert.equal(a.classes.length, 6);
  assert.ok(a.notes[0].text.startsWith("No threshold saved"));
  const top = [...a.classOf].filter((c) => c === 5).length, n = [...a.classOf].filter((c) => c >= 0).length;
  assert.ok(top >= 0.01 * n && top <= 0.05 * n, `${top} of ${n} in the top 2 % class (per population, with ties)`);
});

test("#843 pathfinder index: the multi-element cluster scores high, a one-element spike does not reach 3", () => {
  const S = grid();
  const a = anomalyClasses(S, { mode: "index", preset: "porphyry" }, { units });
  assert.equal(a.classOf[idxOf(S, 500, 500)], 3);
  assert.ok(a.classOf[idxOf(S, 100, 900)] < 3, "Cu alone, Mo / Au / Ag background");
  assert.match(a.label, /mean robust z of Cu, Mo, Au, Ag/);
  const edited = anomalyClasses(S, { mode: "index", preset: "porphyry", elements: ["Cu", "Zr"] }, { units });
  assert.ok(edited.notes.some((n) => n.params?.list === "Zr"), "an element the samples do not have is reported");
  assert.match(edited.label, /\(edited\)/);
});

test("#843 coherence: the lone spike is isolated, the 3 x 3 cluster is not", () => {
  const S = grid();
  const a = anomalyClasses(S, { mode: "index", preset: "porphyry", coherence: true, radius: 75, minNeighbours: 1 }, { units });
  assert.equal(a.isolated[idxOf(S, 500, 500)], 0);
  const spike = idxOf(S, 100, 900);
  if (a.classOf[spike] >= a.anomalousFrom) assert.equal(a.isolated[spike], 1);
  const strict = anomalyClasses(S, { mode: "index", preset: "porphyry", coherence: true, radius: 75, minNeighbours: 4 }, { units });
  assert.equal(strict.isolated[idxOf(S, 500, 500)], 0, "the cluster centre has 8 anomalous neighbours");
  assert.equal(strict.isolated[idxOf(S, 450, 450)], 1, "a cluster corner has 3");
});

test("#843 legend: the rule as the label, one swatch per class, the isolated symbol and no-value", () => {
  const a = anomalyClasses(grid(), { mode: "index", preset: "vms", coherence: true }, { units });
  const g = anomalyLegendGroup(a);
  assert.equal(g.key, "surface_anomaly");
  assert.equal(g.label, a.label);
  assert.equal(g.alwaysHead, true);
  assert.deepEqual(g.items.map((i) => i[0]).slice(-2), ["small symbol: isolated anomaly", "no value"]);
  assert.equal(anomalyLegendGroup(null), null);
  assert.equal(anomalyClasses(grid(), { mode: "medium" }, { units }), null);
});

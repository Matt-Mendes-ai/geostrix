// TASKS.csv #853 — Getis-Ord Gi* hot spots on surface samples: a cluster of high values is a 99 % hot spot, a lone
// spike among background is not, background far away is not significant; too few samples -> no statistic
import test from "node:test";
import assert from "node:assert/strict";
import { anomalyClasses, HOTSPOT_MIN_SAMPLES } from "../src/lib/anomalyMap.js";

function grid(seed = 11) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const out = [];
  for (let x = 0; x <= 1000; x += 50) for (let y = 0; y <= 1000; y += 50) {
    const cluster = Math.abs(x - 500) <= 50 && Math.abs(y - 500) <= 50, spike = x === 100 && y === 900;
    out.push({ sample_id: `${x}_${y}`, x, y, medium: "soil", values: { Cu: cluster || spike ? 300 : 30 * 10 ** (0.15 * g()) } });
  }
  return out;
}
const at = (S, x, y) => S.findIndex((s) => s.x === x && s.y === y);

test("#853 the cluster is a 99 % hot spot, the spike is not, far background is not significant", () => {
  const S = grid();
  const a = anomalyClasses(S, { mode: "hotspot", symbol: "Cu", hotRadius: 75 }, { units: { Cu: "ppm" } });
  assert.equal(a.classes.length, 5);
  assert.equal(a.classOf[at(S, 500, 500)], 4, "cluster centre: hot at 99 %");
  assert.ok(a.classOf[at(S, 100, 900)] <= 3, "a lone spike with eight background neighbours is at most a 95 % hint");
  assert.equal(a.classOf[at(S, 0, 0)], 2);
  assert.ok(a.stat[at(S, 500, 500)] > 2.576 && Math.abs(a.stat[at(S, 0, 0)]) < 1.96);
  assert.match(a.label, /Getis–Ord Gi\* hot spots of log values, each medium against itself, neighbours within 75 m/);
  assert.equal(a.coherence, false, "coherence does not apply to a spatial statistic");
  assert.equal(a.mode, "hotspot");
});

test("#853 with a radius that reaches no neighbour every sample is its own z-score", () => {
  const S = grid();
  const a = anomalyClasses(S, { mode: "hotspot", symbol: "Cu", hotRadius: 10 }, { units: { Cu: "ppm" } });
  const i = at(S, 100, 900);
  assert.ok(a.stat[i] > 2.576, "the spike alone, W = 1: (x - mean) / S");
});

test("#853 too few samples: no statistic, a note", () => {
  const S = grid().slice(0, HOTSPOT_MIN_SAMPLES - 1);
  const a = anomalyClasses(S, { mode: "hotspot", symbol: "Cu", hotRadius: 75 }, { units: { Cu: "ppm" } });
  assert.ok([...a.classOf].every((c) => c === -1));
  assert.equal(a.notes[0].params.min, HOTSPOT_MIN_SAMPLES);
});

test("#1382: each medium is tested against itself — a soil line beside high rock chips is not a hot spot because of them", async () => {
  const { anomalyClasses } = await import("../src/lib/anomalyMap.js");
  const samples = [];
  for (let i = 0; i < 30; i++) samples.push({ x: i * 25, y: 0, medium: "soil", values: { Zn: 50 + (i % 3) } }); // flat soil line
  for (let i = 0; i < 12; i++) samples.push({ x: 2000 + i * 400, y: 3000, medium: "rock chip", values: { Zn: 5000 } }); // high rocks elsewhere
  for (let i = 0; i < 12; i++) samples.push({ x: 300 + i * 30, y: 40, medium: "stream sediment", values: { Zn: 2 } }); // low streams beside the soils
  const r = anomalyClasses(samples, { mode: "hotspot", symbol: "Zn", hotRadius: 100 }, { units: { Zn: "ppm" } });
  const soilHot = samples.map((s, i) => (s.medium === "soil" && r.classOf[i] >= 3 ? 1 : 0)).reduce((a, b) => a + b, 0);
  assert.equal(soilHot, 0, "pooled, the soils sat far above the low streams and lit up");
});

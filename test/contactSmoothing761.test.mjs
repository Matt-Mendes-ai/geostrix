// TASKS.csv #761 — automatic local smoothing of clustered contacts: KDE density, which points get a nugget.
import test from "node:test";
import assert from "node:assert/strict";
import { kdeDensity, clusterNuggets, smoothClusteredSpec } from "../src/lib/contactSmoothing.js";

// deterministic noise
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };

// the paper's set-up: 36 regular points over 1 km and two clusters of 25 noisy points
const regular = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) regular.push({ x: 83 + i * 167, y: 83 + j * 167, z: 500 });
const cluster = (cx, cy) => Array.from({ length: 25 }, () => ({ x: cx + 50 * rnd(), y: cy + 50 * rnd(), z: 500 + 25 * rnd() }));
const paper = [...regular, ...cluster(300, 300), ...cluster(700, 650)];

test("density: higher in the clusters than on the regular points", () => {
  const d = kdeDensity(paper);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const reg = mean([...d.slice(0, 36)]), clu = mean([...d.slice(36)]);
  assert.ok(clu > 3 * reg, `${clu} vs ${reg}`);
  assert.equal(kdeDensity(paper.slice(0, 2)), null);
  assert.equal(kdeDensity(paper, { maxN: 10 }), null);
});

test("the paper's set-up: the cluster points get a nugget, the regular ones stay exact", () => {
  const r = clusterNuggets(paper);
  assert.equal(r.total, 86);
  const regSmoothed = r.nuggets.slice(0, 36).filter((v) => v != null).length;
  const cluSmoothed = r.nuggets.slice(36).filter((v) => v != null).length;
  assert.ok(regSmoothed <= 2, String(regSmoothed)); // a regular point right beside a cluster shares its density
  assert.ok(cluSmoothed >= 45, String(cluSmoothed));
  assert.equal(r.smoothed, cluSmoothed + regSmoothed);
  assert.ok(r.nuggets.slice(36).filter((v) => v != null).every((v) => v >= 0.25 && v <= 0.5));
});

test("a steep contact (the same points stood on end) is treated like a flat one", () => {
  const vertical = paper.map((p) => ({ x: p.x, y: 500 + (p.z - 500) * 0.2, z: p.y }));
  assert.equal(clusterNuggets(vertical).smoothed, clusterNuggets(paper).smoothed);
});

test("evenly drilled data is left alone (no cluster relative to the rest)", () => {
  const even = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) even.push({ x: i * 50 + 5 * rnd(), y: j * 50 + 5 * rnd(), z: 300 + 10 * rnd() });
  assert.equal(clusterNuggets(even).smoothed, 0);
});

test("a soft intercept's larger nugget is kept; the spec keeps its other fields", () => {
  const pts = paper.map((p, i) => (i === 0 ? { ...p, nugget: 0.5, hole: "A" } : i === 40 ? { ...p, nugget: 0.9 } : p));
  const { spec, report } = smoothClusteredSpec({ name: "DACT", points: pts }, {});
  assert.equal(spec.name, "DACT");
  assert.equal(spec.points[0].nugget, 0.5); // a corner point, not clustered: its own nugget untouched
  assert.equal(spec.points[0].hole, "A");
  assert.equal(spec.points[40].nugget, 0.9);
  assert.ok(report.smoothed > 0);
  const none = smoothClusteredSpec({ points: regular }, {});
  assert.equal(none.spec.points, regular);
});

// TASKS.csv #2658 — one value per hole (highest / length-weighted mean / depth of the first interval at or over a threshold, of an assay
// element or a numeric log) gridded at the collars with the surface-sample gridding, on the Maps plan
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeValueSources, holeValueRows, perHoleValue, holeSamples, holeValueMeta } from "../src/lib/holeValueGrid.js";
import { gridSamples } from "../src/lib/sampleGrid.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

// SYNTHETIC holes and values (made-up numbers, not a deposit)
const assays = [
  { hole_id: "A", from: 0, to: 2, values: { U: 50 } }, { hole_id: "A", from: 2, to: 4, values: { U: 150 } }, { hole_id: "A", from: 4, to: 8, values: { U: 300 } },
  { hole_id: "B", from: 0, to: 5, values: { U: 20 } }, { hole_id: "B", from: 5, to: 10, values: { U: 40 } },
];

test("#2658 per-hole statistics, the depth to a threshold included", () => {
  assert.deepEqual([...perHoleValue(assays, "U", "max")], [["A", 300], ["B", 40]]);
  assert.deepEqual([...perHoleValue(assays, "U", "mean")], [["A", (50 * 2 + 150 * 2 + 300 * 4) / 8], ["B", 30]]);
  const d = perHoleValue(assays, "U", "firstOver", { threshold: 100 });
  assert.deepEqual([...d], [["A", 2]]); // B never reaches 100: no value, not a zero
  assert.deepEqual([...perHoleValue([...assays].reverse(), "U", "firstOver", { threshold: 100 })], [["A", 2]]); // the shallowest, whatever the row order
  assert.equal(perHoleValue(assays, "U", "firstOver", { threshold: "" }).size, 0);
});

test("#2658 sources: the assay elements and the numeric logs", () => {
  const customLayers = [{ id: 7, name: "Gamma", unit: "cps", rows: [{ hole_id: "A", from: 0, to: 1, value: 80 }, { hole_id: "A", from: 1, to: 2, value: 120 }, { hole_id: "B", from: 0, to: 1, value: 60 }] }];
  const s = holeValueSources({ assayElements: [{ symbol: "U", unit: "ppm" }], layers: {}, customLayers });
  assert.deepEqual(s.map((x) => [x.id, x.symbol, x.unit, x.kind]), [["a:U", "U", "ppm", "assay"], ["custom:7:value", "Gamma", "cps", "log"]]);
  const rows = holeValueRows(s[1], { customLayers });
  assert.deepEqual([...perHoleValue(rows, "Gamma", "max")], [["A", 120], ["B", 60]]);
  assert.deepEqual(holeValueMeta(s[0], "max"), { unit: "ppm", what: "highest U" });
  assert.deepEqual(holeValueMeta(s[0], "firstOver", 100), { unit: "m", what: "depth to U >= 100 ppm" });
});

test("#2658 the holes are gridded at their collars like samples", () => {
  const collars = [], vals = new Map();
  for (let i = 0; i < 25; i++) { const id = `H${i}`, x = 500000 + (i % 5) * 100, y = 7000000 + Math.floor(i / 5) * 100; collars.push({ hole_id: id, x, y, z: 300 }); vals.set(id, 10 + i); }
  collars.push({ hole_id: "NOVAL", x: 500250, y: 7000250, z: 300 }); // no value: not a point
  const pts = holeSamples(collars, vals);
  assert.equal(pts.length, 25);
  const res = gridSamples(pts, "value", { cellM: 50, method: "idw" });
  assert.equal(res.points, 25);
  const g = res.grid, at = (x, y) => g.values[Math.round((g.yTop - y) / g.dy) * g.nx + Math.round((x - g.x0) / g.dx)];
  assert.equal(at(500200, 7000300), 10 + 17); // a node on a collar keeps the hole's value (IDW is exact there)
  assert.ok(Number.isFinite(at(500150, 7000150)));
  assert.equal(gridSamples(pts.slice(0, 2), "value", { cellM: 50 }).error, "few");
});

test("#2658 the plan offers it and its figure draws the collars", () => {
  const m = read("components/MapsPlanView.jsx"), p = read("components/HoleValueGridPanel.jsx");
  assert.match(m, /<HoleValueGridPanel \/>/);
  assert.match(m, /r\.geochem\.source === "holes" \? holeFigurePoints\(r\.geochem/);
  assert.match(m, /\{n\} holes at their collars, on the grid's colour scale/);
  assert.match(p, /source: "holes", sourceId: source\.id, stat/);
  assert.match(p, /gridSamples\(samples, KEY, \{ log, cellM/);
  // #2991: st is the statistic valid for the source (a coded log has its own), and a coded log's thickness / depth is never logged
  assert.match(p, /const log = st === "firstOver" \|\| coded \? false : logChoice \?\? logByDefault\(source\?\.unit\)/);
});

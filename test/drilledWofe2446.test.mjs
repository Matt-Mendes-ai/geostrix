// TASKS.csv #2446 (review #2325, WA uranium) — drillhole occurrences: the weights are trained on the drilled cells (hits against misses),
// not on every cell within reach, so 'a hole is here' no longer passes for evidence
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drilledTrainingMask, trainingCells, bestCutoff, posterior, weights } from "../src/lib/evidence.js";

// a 40 x 40 grid of 10 m cells; 100 holes on a 4-cell lattice, 50 of them hits. An evidence E is 1 in the west half; 40 of the 50 hits
// and 10 of the 50 misses are in the west. A second evidence is 'distance to drilling': 0 on a hole cell, larger away from them.
const g = { nx: 40, ny: 40, x0: 0, yTop: 390, dx: 10, dy: 10 }, n = g.nx * g.ny;
const valid = new Uint8Array(n).fill(1), E = new Float64Array(n), dist = new Float64Array(n);
const holes = [];
for (let j = 0; j < 40; j += 4) for (let i = 0; i < 40; i += 4) holes.push({ i, j, x: i * 10, y: 390 - j * 10 });
for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) { const k = j * 40 + i; E[k] = i < 20 ? 1 : 0; dist[k] = Math.hypot((i % 4) - 0, (j % 4) - 0) * 10; }
const west = holes.filter((h) => h.i < 20), east = holes.filter((h) => h.i >= 20);
const hits = [...west.slice(0, 40), ...east.slice(0, 10)];

test("trained on the drilled cells, E's weights are the holes' own; trained on every cell they are inflated", () => {
  const { mask, n: N } = drilledTrainingMask(g, holes, valid);
  assert.equal(N, 100);
  const D = trainingCells(g, hits, mask);
  const drilled = bestCutoff(E, D, mask, { direction: "increasing" }).best;
  const hand = weights(50, 40, 100, 50); // 50 holes in the west, 40 of them hits
  assert.ok(Math.abs(drilled.wPlus - hand.wPlus) < 1e-9, `${drilled.wPlus} vs ${hand.wPlus}`); // ln(0.8 / 0.2) = 1.386
  const everyCell = bestCutoff(E, trainingCells(g, hits, valid), valid, { direction: "increasing" }).best;
  assert.ok(everyCell.wPlus < drilled.wPlus || Math.abs(everyCell.C - drilled.C) > 0.1); // a different, area-based figure
});

test("'distance to drilling' carries no weight when the study area is the drilled cells", () => {
  const { mask } = drilledTrainingMask(g, holes, valid);
  const D = trainingCells(g, hits, mask);
  assert.equal(bestCutoff(dist, D, mask, { direction: "decreasing" }).best, null); // 0 on every drilled cell: nothing to tell apart
  const area = bestCutoff(dist, trainingCells(g, hits, valid), valid, { direction: "decreasing" }).best;
  assert.ok(area && area.wPlus > 1.5, String(area?.wPlus)); // the old study area: 'a hole is here' scored as evidence
});

test("the omnibus sum is over the drilled cells; the posterior still covers the grid; the pane trains on them", () => {
  const { mask, n: N } = drilledTrainingMask(g, holes, valid);
  const D = trainingCells(g, hits, mask), w = weights(50, 40, N, D.size);
  const post = posterior([{ values: E, cutoff: 1, direction: "increasing", wPlus: w.wPlus, wMinus: w.wMinus }], valid, N, D.size, { countMask: mask });
  assert.ok(Math.abs(post.expected - 50) < 1e-6, String(post.expected)); // one layer: the posterior gives back the 50 hits exactly
  assert.ok(Number.isFinite(post.prob[1 * 40 + 1])); // an undrilled cell has a posterior too
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const drilled = training\.source === "collars" && sampledPoints\.length \? drilledTrainingMask\(grid, sampledPoints, valid\) : null;/);
  assert.match(p, /bestCutoff\(l\.values, D, trainMask, /);
  assert.match(p, /posterior\(chosen, valid, N, ND, \{ countMask: drilled \? trainMask : null \}\)/);
});

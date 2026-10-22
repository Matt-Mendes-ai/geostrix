// TASKS.csv #802 — solid blocks from modelled surfaces: units between stacked tops, the inside of closed solids, the
// terrain cut, and the block feeding the existing unit-volume / block-model code unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { surfacesToBlock, suggestCellSize } from "../src/lib/surfaceSolids.js";
import { unitShell, meshVolume } from "../src/lib/unitVolumes.js";
import { blockToCells, unitAt } from "../src/lib/modelCheck.js";

// a flat (or tilted) sheet over [x0,x1] x [y0,y1]: z = f(x, y), as a 2 x 2-quad triangle mesh
const sheet = (name, x0, x1, y0, y1, f, n = 4) => {
  const positions = [], indices = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n; positions.push(x, y, f(x, y)); }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; indices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1); }
  return { name, positions, indices };
};
// a closed axis-aligned box shell
const boxShell = (name, [x0, x1, y0, y1, z0, z1]) => {
  const v = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) v.push(x, y, z);
  const f = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const indices = f.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return { name, positions: v, indices };
};
const box = [0, 100, 0, 100, 0, 150];

test("#802 two stacked tops: the unit between them, the unit below the last, nothing above the first", () => {
  const r = surfacesToBlock({ tops: [sheet("DACT", -10, 110, -10, 110, () => 100), sheet("VCL", -10, 110, -10, 110, () => 50)], extent: box, cell: 10 });
  assert.deepEqual(r.block.resolution, [10, 10, 15]);
  assert.deepEqual(r.block.labels, [null, "DACT", "VCL"]);
  assert.equal(r.counts.DACT, 10 * 10 * 5);
  assert.equal(r.counts.VCL, 10 * 10 * 5);
  assert.equal(unitAt(r.block, 50, 50, 125), null, "above every top: not modelled");
  assert.equal(unitAt(r.block, 50, 50, 75), "DACT");
  assert.equal(unitAt(r.block, 50, 50, 5), "VCL");
  assert.equal(r.coverage.DACT, 1);
  // straight into #517's unit shells and #356's block-model cells
  const s = unitShell(r.block, "DACT");
  assert.ok(Math.abs(meshVolume(s.positions, s.indices) - 100 * 100 * 50) < 1e-6);
  assert.equal(blockToCells(r.block).length, 1000, "only the modelled units become blocks");
});

test("#802 a tilted top and one that covers only half the area", () => {
  const r = surfacesToBlock({ tops: [sheet("A", -10, 110, -10, 110, (x) => 50 + x), sheet("B", -10, 50, -10, 110, () => 20)], extent: box, cell: 10 });
  assert.equal(unitAt(r.block, 5, 50, 60), null, "x=5: A sits at 55, the cell at 60 is above it");
  assert.equal(unitAt(r.block, 5, 50, 45), "A");
  assert.equal(unitAt(r.block, 25, 50, 15), "B", "B below 20 where it exists");
  assert.equal(unitAt(r.block, 75, 50, 15), "A", "beyond B's footprint, A continues down");
  assert.ok(Math.abs(r.coverage.B - 0.5) < 1e-9);
});

test("#802 a closed solid overrides the stack inside it; the terrain cuts the top", () => {
  const r = surfacesToBlock({
    tops: [sheet("HOST", -10, 110, -10, 110, () => 140)],
    solids: [boxShell("VEIN", [20, 60, 30, 50, 40, 80])],
    extent: box, cell: 10, ground: (x) => (x < 50 ? 130 : 120),
  });
  assert.deepEqual(r.block.labels, [null, "HOST", "VEIN"]);
  assert.equal(r.counts.VEIN, 4 * 2 * 4, "exactly the cells whose centres are inside the box shell");
  assert.equal(unitAt(r.block, 45, 45, 65), "VEIN");
  assert.equal(unitAt(r.block, 15, 45, 65), "HOST");
  assert.equal(unitAt(r.block, 75, 45, 125), undefined, "above the ground: outside the model");
  assert.equal(unitAt(r.block, 25, 45, 125), "HOST");
  const s = unitShell(r.block, "VEIN");
  assert.ok(Math.abs(meshVolume(s.positions, s.indices) - 40 * 20 * 40) < 1e-6);
});

test("#802 solids alone (no tops): only their insides are modelled; size guards", () => {
  const r = surfacesToBlock({ solids: [boxShell("PIT", [0, 100, 0, 100, 100, 150])], extent: box, cell: 25 });
  assert.equal(r.counts.PIT, 4 * 4 * 2);
  assert.equal(unitAt(r.block, 50, 50, 50), null);
  assert.throws(() => surfacesToBlock({ tops: [], extent: box, cell: 0.1 }), /limit/);
  assert.equal(suggestCellSize([0, 1000, 0, 1000, 0, 500], 250_000), 20); // raw 12.6 m -> 20
  assert.equal(suggestCellSize([0, 100, 0, 100, 0, 100], 1000), 10);
});

// TASKS.csv #830 / #832 — lower contacts, several surfaces for one unit, and layers of one unit (A, B) in a stack
const flat = (name, z, extra) => ({ ...sheet(name, -10, 110, -10, 110, () => z), ...extra });

test("#830 a unit with an upper and a lower contact: a gap below its base, then the next unit", () => {
  const r = surfacesToBlock({ tops: [flat("Top Basalt", 120, { unit: "Basalt" }), flat("Base Basalt", 90, { unit: "Basalt", role: "base" }), flat("Top Shale", 60, { unit: "Shale" })], extent: box, cell: 10 });
  assert.deepEqual(r.block.labels, [null, "Basalt", "Shale"], "one label per unit, not per surface");
  assert.equal(unitAt(r.block, 50, 50, 105), "Basalt");
  assert.equal(unitAt(r.block, 50, 50, 75), null, "between Basalt's base and Shale's top: nobody modelled it");
  assert.equal(unitAt(r.block, 50, 50, 25), "Shale");
  assert.equal(r.counts.Basalt, 10 * 10 * 3);
});

test("#830 a unit known only by its base runs up to the ground; a base on the next unit's top", () => {
  const r = surfacesToBlock({ tops: [flat("Base Till", 130, { unit: "Till", role: "base" }), flat("Top Andesite", 130, { unit: "Andesite" })], extent: box, cell: 10 });
  assert.equal(unitAt(r.block, 50, 50, 145), "Till", "above its base, nothing above: the unit whose base is below");
  assert.equal(unitAt(r.block, 50, 50, 105), "Andesite", "below both (picked on the same contact): the top wins");
  const r2 = surfacesToBlock({ tops: [flat("Top Andesite", 130, { unit: "Andesite" }), flat("Base Till", 130, { unit: "Till", role: "base" })], extent: box, cell: 10 });
  assert.equal(unitAt(r2.block, 50, 50, 105), "Andesite", "in either stack order");
  assert.equal(unitAt(r2.block, 50, 50, 145), "Till");
});

test("#832 one unit in several layers (Sandstone A, B) between shale", () => {
  const tops = [
    flat("SST A top", 140, { unit: "Sandstone A" }), flat("SST A base", 120, { unit: "Sandstone A", role: "base" }),
    flat("Shale top", 120, { unit: "Shale" }),
    flat("SST B top", 80, { unit: "Sandstone B" }), flat("SST B base", 60, { unit: "Sandstone B", role: "base" }),
  ];
  const r = surfacesToBlock({ tops, extent: box, cell: 10 });
  assert.deepEqual(r.block.labels, [null, "Sandstone A", "Shale", "Sandstone B"]);
  assert.deepEqual([135, 125, 115, 85, 75, 65, 55, 5].map((z) => unitAt(r.block, 50, 50, z)), ["Sandstone A", "Sandstone A", "Shale", "Shale", "Sandstone B", "Sandstone B", null, null]);
  // tops only (the old way): unchanged
  const legacy = surfacesToBlock({ tops: [flat("A", 100), flat("B", 50)], extent: box, cell: 10 });
  assert.deepEqual(legacy.block.labels, [null, "A", "B"]);
});

// TASKS.csv #1662 (review #1646, Kodiak) — a block-model CSV of an inversion mesh: air left out, variable widths from the centroids
import test from "node:test";
import assert from "node:assert/strict";
import { inferAxisWidths, blockModelCellsFromRows } from "../src/lib/blockModelCsv.js";

test("#1662 widths from centroids: a core of 30 m cells padded by 40 and 60 m cells comes back exactly", () => {
  const widths = [60, 40, 30, 30, 30, 30, 30, 40, 60];
  const centres = []; let x = 0; for (const w of widths) { centres.push(x + w / 2); x += w; }
  const m = inferAxisWidths(centres);
  assert.deepEqual(centres.map((c) => +m.get(c).toFixed(6)), widths);
  assert.deepEqual([...inferAxisWidths([5]).values()], [1], "a lone centroid gets the fallback");
  assert.deepEqual([...inferAxisWidths([0, 10, 20]).values()], [10, 10, 10]);
});

test("#1662 the CSV route masks air like a UBC model, infers per-axis variable widths and says so", () => {
  const rows = [];
  const xs = [15, 45, 75, 105, 140, 190], zs = [-5, -15, -25, -35, -45, -57.5, -75]; // 30 m core with 40 / 60 m padding; 10 m layers then 15 and 20 m
  for (const x of xs) for (const z of zs) for (const y of [15, 45]) rows.push({ X: x, Y: y, Z: z, res: z > -10 ? 1e-8 : 100 + x });
  const r = blockModelCellsFromRows(rows, { x: "X", y: "Y", z: "Z" }, "res");
  assert.equal(r.air.count, 12); assert.equal(r.air.value, 1e-8);
  assert.equal(r.cells.length, rows.length - 12);
  assert.ok(r.inferred.dx.variable && Math.abs(r.inferred.dx.min - 30) < 1e-9 && Math.abs(r.inferred.dx.max - 60) < 1e-9, JSON.stringify(r.inferred.dx));
  assert.ok(!r.inferred.dy.variable && r.inferred.dy.min === 30);
  assert.ok(r.inferred.dz.variable && r.inferred.dz.min === 10 && r.inferred.dz.max === 20, JSON.stringify(r.inferred.dz));
  const c = r.cells.find((q) => q.x === 190 && q.z === -75);
  assert.equal(c.dx, 60); assert.equal(c.dz, 20);
  assert.equal(r.badRows, 0);
});

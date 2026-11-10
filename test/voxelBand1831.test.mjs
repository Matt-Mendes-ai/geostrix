// TASKS.csv #1831 (review #1646, Kodiak) — a block model becomes plan evidence over an elevation band, without its air flag
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voxelColumnEvidence, airFlagOf, voxelZRange } from "../src/lib/evidenceSources.js";
import { evidenceGrid } from "../src/lib/evidence.js";
import { maskAirCells } from "../src/lib/voxel.js";

// one 100 x 100 m column: air (-1) above 1,600 m, then 30, 12, 4 mV/V downwards
const cells = [[1650, -1], [1550, 30], [1450, 12], [1350, 4]].map(([z, value]) => ({ x: 50, y: 50, z, dx: 100, dy: 100, dz: 100, value }));
const model = { name: "chg", cells };
const g = evidenceGrid({ extent: [0, 0, 100, 100], cellSize: 100 });

test("the -1 air flag is not a value: 'lowest' reads 4, not -1", () => {
  assert.equal(airFlagOf(model), -1);
  assert.equal(voxelColumnEvidence(g, model, "min")[0], 4);
  assert.equal(voxelColumnEvidence(g, model, "max")[0], 30);
  assert.equal(airFlagOf({ cells: [{ value: -0.5 }, { value: -0.2 }, { value: 3 }] }), null, "real negative values are kept");
});

test("an elevation band reads one level; mean averages it", () => {
  assert.equal(voxelColumnEvidence(g, model, "max", { zMin: 1300, zMax: 1500 })[0], 12);
  assert.equal(voxelColumnEvidence(g, model, "mean", { zMin: 1300, zMax: 1600 })[0], Math.fround((30 + 12 + 4) / 3));
  assert.ok(Number.isNaN(voxelColumnEvidence(g, model, "max", { zMin: 2000 })[0]), "nothing in the band: no evidence");
  assert.deepEqual(voxelZRange(model), [1350, 1650]);
});

test("the pane offers the band and keeps it in the saved recipe", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("voxelColumnEvidence(grid, m, src.how, own ? { zMin: opts.zMin, zMax: opts.zMax } : { zMin: lv?.zMin ?? null, zMax: lv?.zMax ?? null })")); // the card's own band, else the pane's Level (#2326)
  assert.ok(p.includes('...(l.kind === "voxel" ? { zMin: l.zMin ?? null, zMax: l.zMax ?? null } : {})'));
  assert.ok(p.includes("(mean in each column)"));
});

test("a project saved before #1659: air averaged into a few mixed blocks still reads as air", () => {
  // Kodiak's saved chargeability: 19,824 cells at -1, 439 mixed blocks between -0.75 and 0, the rest rock
  const vals = [...Array(198).fill(-1), -0.75, -0.4, -0.035, ...Array.from({ length: 700 }, (_, i) => i / 30)];
  const m = { cells: vals.map((value, i) => ({ x: 50, y: 50, z: 2000 - i, dx: 100, dy: 100, dz: 1, value })) };
  assert.equal(airFlagOf(m), -1);
  const arr = Float64Array.from(vals);
  assert.equal(maskAirCells(arr).count, 198);
  // a susceptibility with real negatives keeps them
  assert.equal(airFlagOf({ cells: [-0.002, -0.001, -0.0005, 0.01, 0.02].map((value) => ({ value })) }), null);
  assert.equal(maskAirCells(Float64Array.from([-0.002, -0.001, -0.0005, 0.01, 0.02])).count, 0);
});

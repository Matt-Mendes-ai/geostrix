// TASKS.csv #2879 (#2831) — Identify on a block-averaged raster says the value is a block mean, with the block's highest and lowest node.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rasterValueText, rasterCellAt, rasterValueAt } from "../src/lib/viewer/identify.js";

// 2 x 2 kept nodes at 30 m (3 x 3 source nodes of 10 m each), centres at x 15 / 45, y 45 / 15
const grid = { nx: 2, ny: 2, x0: 15, yTop: 45, dx: 30, dy: 30, values: new Float32Array([67.68, 5, 6, 7]), averagedBy: 3,
  maxValues: new Float32Array([417.5, 9, 9, 9]), minValues: new Float32Array([-2.1, 1, 1, 1]) };

test("the cell under a point, and its value, as before", () => {
  assert.deepEqual(rasterCellAt(grid, 16, 44), { col: 0, row: 0 });
  assert.equal(rasterCellAt(grid, 200, 44), null);
  assert.ok(Math.abs(rasterValueAt(grid, 16, 44) - 67.68) < 1e-4);
});

test("a block mean says so, with the block's extremes where kept; a plain grid prints the value alone", () => {
  assert.equal(rasterValueText(grid, 16, 44, 67.68, "nT"), "67.68 nT (mean of 3 × 3 nodes; highest in this cell 417.5, lowest -2.1)");
  const noExtremes = { ...grid, maxValues: undefined, minValues: undefined };
  assert.equal(rasterValueText(noExtremes, 16, 44, 67.68), "67.68 (mean of 3 × 3 nodes)");
  assert.equal(rasterValueText({ ...grid, averagedBy: 1 }, 16, 44, 67.68, "nT"), "67.68 nT");
  assert.equal(rasterValueText(undefined, 16, 44, 4.5), "4.5");
});

test("wiring: the raster's Value line uses it; the keys are in every locale", () => {
  const id = fs.readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8");
  assert.match(id, /fields\.push\(\[tr\("Value"\), rasterValueText\(rs\.grid, world\.e, world\.n, v, unit\)\]\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["{v} (mean of {f} × {f} nodes; highest in this cell {max}, lowest {min})"] && j["{v} (mean of {f} × {f} nodes)"], l);
  }
});

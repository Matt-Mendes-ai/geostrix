// TASKS.csv #1590 — the inversion's core-cell hint follows the line spacing on line data, half the station spacing otherwise.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { coreCellHint } from "../src/lib/coreCellHint.js";

test("walk-mag lines 96 m apart with readings every 0.6 m: a quarter of the line spacing (25 m), not 5 m", () => {
  const rows = [];
  for (let L = 0; L < 6; L++) for (let k = 0; k < 300; k++) rows.push({ x: L * 96, y: k * 0.6, line: `L${L}` });
  const h = coreCellHint(rows, 0.6);
  assert.equal(h.cell, 25);
  assert.ok(Math.abs(h.lineSpacing - 96) < 1);
});

test("a station grid (or lines no farther apart than the readings x4): half the spacing, at least 5 m", () => {
  const grid = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) grid.push({ x: i * 50, y: j * 50 });
  assert.deepEqual(coreCellHint(grid, 50), { cell: 25, lineSpacing: null });
  const close = [];
  for (let L = 0; L < 5; L++) for (let k = 0; k < 40; k++) close.push({ x: L * 30, y: k * 25, line: L });
  assert.equal(coreCellHint(close, 25).lineSpacing, null);
  assert.equal(coreCellHint(grid, 3).cell, 5);
  assert.equal(coreCellHint(grid, null), null);
});

test("the pane: the button names the basis and thins the readings to the cell on line data", () => {
  const s = fs.readFileSync("src/components/InversionPanel.jsx", "utf8");
  assert.match(s, /if \(coreHint\.lineSpacing && !\(num\(thin\) > 0\)\) setThin\(String\(coreHint\.cell\)\);/);
  assert.match(s, /coreHint\.lineSpacing \? tr\("≈ quarter line spacing"\) : tr\("≈ half spacing"\)/);
});

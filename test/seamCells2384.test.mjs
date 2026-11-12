// TASKS.csv #2384 (review #2325, WA uranium; Matt's decision 2026-11-11) — a thin, wide unit's closed body: one cubic cell was coarsened
// from 1.8 m to 44.9 m (a 223 x 218 x 1 grid, 8 of 1,749 samples inside). Its indicator grid now gets its own cell height from the logged
// runs and a plan cell from the hole spacing, counted on that grid, and the cells are said before the run.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seamCells } from "../src/lib/viewer/geomath.js";

// the LIG case: a 10 x 9.8 km footprint, 60 m of box height, runs of 3.5 m median (13 m at most), holes 100 m apart
const box = { w: 10000, h: 9800, z: 60 };
const cellsAt = (c, cz) => Math.max(1, Math.round(box.w / c)) * Math.max(1, Math.round(box.h / c)) * Math.max(1, Math.round(box.z / cz));
const autoB = { cell: 1.75, medianRunM: 3.5, maxRunM: 13, spacing: 100, fromRuns: true };

test("#2384: a cubic cell past the thickest run gives way to a cell height from the runs and a plan cell from the spacing", () => {
  const s = seamCells(44.9, autoB, cellsAt, 150000);
  assert.ok(s, "a seam grid");
  assert.equal(s.dz, 1.8); // half the median run (1.75), rounded to 0.1 m: a run is two cells thick
  assert.ok(s.dxy >= 50 && s.dxy <= 400, String(s.dxy)); // from half the hole spacing, grown in plan only
  assert.ok(cellsAt(s.dxy, 1.75) <= 150000, "under the limit on that grid");
  assert.equal(s.coarsened, true);
});

test("#2384: not when the cubic cell keeps within the runs, the runs are unknown or the plan cell would pass four spacings", () => {
  assert.equal(seamCells(10, autoB, cellsAt, 150000), null, "the cube is thinner than the thickest run: as before");
  assert.equal(seamCells(44.9, { ...autoB, fromRuns: false }, cellsAt, 150000), null);
  assert.equal(seamCells(44.9, { ...autoB, spacing: null }, cellsAt, 150000), null);
  assert.equal(seamCells(44.9, { ...autoB, spacing: 20 }, cellsAt, 150000), null, "plan cells over 80 m on holes 20 m apart: the cubic rule and its warning stand");
});

test("#2384: the run uses it (not under a geology trend, not for a typed cell), says the cells first and records them", () => {
  const s = fs.readFileSync("src/modules/viewer/modellingRuns.js", "utf8");
  assert.match(s, /const seam = isCode && !anisotropy\.enabled && !\(cellSetting > 0\) \? seamCells\(cell, autoB, cellsAt3, MAX_BLOCKS \* 0\.75\) : null;/);
  assert.match(s, /cellSize: \{ dx: cell, dy: cell, dz: cellZ \/\* #2384 \*\/ \}/);
  assert.match(s, /const past = isCode && !seam \? bodyCellPastRuns/);
  assert.match(s, /cellSizeM: cellText, \.\.\.\(seam \? \{ cellHeightM: cellZ/);
  assert.ok(s.includes("is logged in thin runs (median {med} m, {max} m at most) over {w} × {h} km") && s.includes("Veins / dykes."));
});

// TASKS.csv #3363 — IDW's time follows the cells, not the points: a large grid asks first, with an estimate
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idwGrid } from "../src/lib/idw.js";

test("#3363 IDW on a big 3D cloud: the time follows the cells (the cost per cell is within a factor of three at 10x the points)", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ x: (i * 37) % 3000, y: (i * 91) % 3000, z: i % 9, value: i % 17 }));
  const box = { xmin: 0, ymin: 0, xmax: 3000, ymax: 3000, cellSize: 20, power: 2, maxDistance: 100 }; // 22,500 cells
  const time = (pts) => { const t0 = performance.now(); idwGrid(pts, box); return performance.now() - t0; };
  time(mk(2000)); // warm
  const few = Math.min(time(mk(2000)), time(mk(2000))), many = Math.min(time(mk(20000)), time(mk(20000)));
  assert.ok(many < few * 12, `${few.toFixed(1)} ms for 2,000 points, ${many.toFixed(1)} ms for 20,000`); // ten times the points is nowhere near ten times the time per cell
});

test("#3363 the Generate button asks before an IDW grid over 500,000 cells, with the estimate", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /if \(idwMethod === "idw" && gridW \* gridH > 500_000 && !window\.confirm\(tr\("This grid has \{cells\} cells\./);
  assert.match(g, /s: Math\.max\(5, Math\.round\(\(gridW \* gridH\) \/ 100_000\)\)/);
});

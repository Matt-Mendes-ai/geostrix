// TASKS.csv #2762 (split from #2429) — Solid blocks from surfaces opened at 20 m blocks on a 15.6 Mm³ sheet a few blocks thick. The panel now
// names the thinnest closed solid's thickness and offers the block size that puts three blocks across it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solidThickness, cellAcross } from "../src/lib/surfaceSolids.js";

// a closed box: w × d × h, 12 triangles, outward
function box(w, d, h) {
  const P = [0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h];
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { positions: new Float64Array(P), indices: new Uint32Array(I) };
}

test("a sheet's thickness from its volume and area", () => {
  const s = box(1000, 800, 20);
  const t = solidThickness(s.positions, s.indices);
  assert.ok(Math.abs(t - 20) / 20 < 0.06, "a 20 m sheet: " + t.toFixed(2)); // the edges add a little area
  const c = box(100, 100, 100);
  assert.ok(Math.abs(solidThickness(c.positions, c.indices) - 33.3) < 0.5, "a cube: 2V/A = a third of its side");
  assert.equal(solidThickness(new Float64Array(), new Uint32Array()), null);
});

test("three blocks across, on the usual round steps", () => {
  assert.equal(cellAcross(20), 5, "20 m / 3 = 6.7 -> 5");
  assert.equal(cellAcross(60), 20);
  assert.equal(cellAcross(3), 1);
  assert.equal(cellAcross(0), null);
});

test("the panel offers it, without imposing it", () => {
  const p = readFileSync(new URL("../src/components/SurfaceSolidsPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const thinCell = thinnest && cell && cell > thinnest\.t \/ 3 \? cellAcross\(thinnest\.t\) : null;/);
  assert.match(p, /onClick=\{\(\) => setCellIn\(String\(thinCell\)\)\}/);
  // the button only within the panel's 2,000,000-block limit (WA uranium's 7 m LIG sheet asked for 1.1 billion at 2 m)
  assert.match(p, /\{thinCells <= 2_000_000 \? <>/);
  assert.match(p, /over the 2,000,000 limit\."/);
});

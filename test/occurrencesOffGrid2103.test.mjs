// TASKS.csv #2103 — 'Only 0 occurrence cells' now says the points lie outside the grid (the #1558 coverage beside the fewPoints line)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { trainingCoverage } from "../src/lib/evidence.js";

test("the coverage counts the points off the grid", () => {
  const g = { x0: 5, yTop: 95, dx: 10, dy: 10, nx: 10, ny: 10 };
  const c = trainingCoverage(g, [{ x: 500, y: 500 }, { x: 600, y: 600 }], new Uint8Array(100).fill(1));
  assert.equal(c.points, 2); assert.equal(c.inGrid, 0); assert.equal(c.cells, 0);
});

test("the fewPoints line carries it", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.ok(p.includes('tr(result.cover.inGrid === 0 ? "All {n} occurrence point(s) lie outside this grid: choose an Area that holds them (every source, or the surface samples)." : "{m} of the {n} occurrence point(s) lie outside this grid."'));
});

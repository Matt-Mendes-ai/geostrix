// TASKS.csv #2618 (re-test of #2446) — the drilled cells are grid cells holding a sample (binned finer than a cell), and the header says
// so with the hole counts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeGradePoints } from "../src/lib/evidenceSources.js";
import { trainingCells } from "../src/lib/evidence.js";

test("25 m grade bins drop 10 m cells; a quarter-cell bin keeps every cell that holds a sample", () => {
  // one vertical hole sampled 0-100 m at x 0..; a row of 20 holes 5 m apart in x: 100 m of drilling in plan, 10 m cells
  const traces = new Map(), assays = [];
  for (let i = 0; i < 20; i++) { const id = `H${i}`; traces.set(id, [{ x: i * 5, y: 1, z: 100, md: 0 }, { x: i * 5, y: 1, z: 0, md: 100 }]); assays.push({ hole_id: id, from: 10, to: 11, values: { Li: 1 } }); }
  const g = { nx: 20, ny: 2, x0: 0, yTop: 10, dx: 10, dy: 10 }, valid = new Uint8Array(40).fill(1);
  const coarse = trainingCells(g, holeGradePoints(assays, "Li", "%", { Li: "%" }, traces), valid).size;
  const fine = trainingCells(g, holeGradePoints(assays, "Li", "%", { Li: "%" }, traces, 2.5), valid).size;
  assert.ok(fine > coarse, `${fine} vs ${coarse}`);
  assert.equal(fine, 11); // x 0..95 in 10 m cells centred on multiples of 10 (Math.round): 0..10
});

test("the pane bins on the grid cell and the header names cells and holes", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const cellBin = Math\.max\(0\.5, \(grid\?\.dx \|\| 25\) \/ 4\);/);
  assert.equal((p.match(/assayUnits, traces, cellBin\)/g) || []).length, 2);
  assert.match(p, /drilled cells \(grid cells holding a \{sym\} sample, in \{h\} holes\): \{d\} with a sample at or over the cut-off \(in \{hh\} holes\)/);
});

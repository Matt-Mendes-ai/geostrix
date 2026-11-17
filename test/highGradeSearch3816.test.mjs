// TASKS.csv #3816 (#3784) — a high-grade search restriction: composites at or above a grade inform only the blocks within a share of the search radius.
// SYNTHETIC: background 1 g/t samples on a ring and one 100 g/t spike 40 m east.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";

const pts = [];
for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * Math.PI; pts.push({ x: 30 * Math.cos(a) - 200, y: 30 * Math.sin(a), z: 0, value: 1, hole_id: `B${i}`, length: 2 }); }
pts.push({ x: -160, y: 0, z: 0, value: 100, hole_id: "SPIKE", length: 2 }); // 40 m east of the ring's centre
const bounds = { xmin: -231, xmax: -111, ymin: -31, ymax: 31, zmin: -1, zmax: 1 };
const run = (extra = {}) => estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 2 }, method: "idw2", searchRadius: 80, minSamples: 1, maxSamples: 16, minHoles: 1, ...extra });
const near = (res, x) => res.cells.filter((c) => Math.abs(c.x - x) < 6 && Math.abs(c.y) < 6);

test("off: unchanged; on: the spike no longer informs the blocks beyond half the radius, and still informs those within it", () => {
  const off = run(), same = run({ highGrade: null });
  assert.deepEqual(same.cells.map((c) => c.value), off.cells.map((c) => c.value));
  const on = run({ highGrade: { min: 50, factor: 0.5 } }); // the spike's reach: 40 m
  const farBlock = (res) => near(res, -226)[0].value, nearBlock = (res) => near(res, -165)[0].value; // 66 m and 5 m from the spike
  assert.ok(farBlock(off) > 1.2, `the spike spread to the far side: ${farBlock(off).toFixed(2)}`);
  assert.ok(Math.abs(farBlock(on) - 1) < 1e-9, `the far block is the background only: ${farBlock(on)}`);
  assert.ok(nearBlock(on) > 10, `a block within its reach keeps it: ${nearBlock(on).toFixed(1)}`);
  assert.equal(nearBlock(on), nearBlock(off), "within the reach nothing changes");
});

test("a factor outside 0..1, or no search radius, is off", () => {
  const off = run().cells.map((c) => c.value);
  assert.deepEqual(run({ highGrade: { min: 50, factor: 1 } }).cells.map((c) => c.value), off);
  assert.deepEqual(run({ highGrade: { min: 50, factor: 0 } }).cells.map((c) => c.value), off);
  assert.deepEqual(run({ highGrade: { min: NaN, factor: 0.5 } }).cells.map((c) => c.value), off);
});

test("wiring: the dialog's inputs, the run's option and the model's record", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const highGrade = hgMin !== "" && Number\.isFinite\(Number\(hgMin\)\) && Number\(hgFactor\) > 0 && Number\(hgFactor\) < 1 \? \{ min: Number\(hgMin\), factor: Number\(hgFactor\) \} : null;/);
  assert.match(m, /\.\.\.\(highGrade \? \{ highGrade \} : \{\}\), \/\/ #3816/);
  assert.match(m, /highGradeSearch: \{ atOrAbove: highGrade\.min/);
  assert.match(m, /aria-label=\{tr\("Grade from which a composite has a shorter search"\)\}/);
});

// TASKS.csv #2546 — the default sphere carried a 15 m-deep pattern 50 m below the hole bottoms (half the lithium below RL 160) and nothing said
// so. The result now gives the share of the estimated metal below the deepest sample of every hole within the search radius.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { belowDrilling } from "../src/lib/belowDrilling.js";

// a 3 x 3 pattern 25 m apart, samples from RL 300 to 285 (15 m deep); blocks of 10 m from RL 305 down to 245
const points = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let z = 299; z >= 285; z -= 2) points.push({ hole_id: `H${i}${j}`, x: i * 25, y: j * 25, z, value: 1 });
const cells = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 6; k++) cells.push({ x: i * 10, y: j * 10, z: 300 - k * 10, dx: 10, dy: 10, dz: 10, value: 1 });

test("blocks wholly under every nearby hole's deepest sample are counted, with their metal", () => {
  const r = belowDrilling(cells, points, 50);
  // block tops at z + 5: 305, 295, 285, 275, 265, 255; deepest sample 285: tops 275 and lower are below (3 of 6 levels)
  assert.equal(r.of, 216); assert.equal(r.blocks, 108); assert.ok(Math.abs(r.metalShare - 0.5) < 1e-9);
  // a deeper hole nearby lowers the limit
  const deep = [...points, { hole_id: "D", x: 25, y: 25, z: 250, value: 1 }];
  assert.equal(belowDrilling(cells, deep, 50).blocks, 0, "a hole to RL 250 within reach of every block");
});

test("no radius, no cells, no points: nothing said", () => {
  assert.deepEqual(belowDrilling(cells, points, 0), { blocks: 0, of: 216, metalShare: 0 });
  assert.deepEqual(belowDrilling([], points, 50), { blocks: 0, of: 0, metalShare: 0 });
  assert.equal(belowDrilling(cells, [], 50).blocks, 0);
});

test("wired: the run computes it, the result says it from 5 % of the metal, naming the Vertical reach field", () => {
  const s = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(s, /est\.belowDrilling = belowDrilling\(est\.cells, points, Number\(searchRadius\) \|\| 0\);/);
  assert.match(s, /result\.belowDrilling\.metalShare >= 0\.05/);
  assert.match(s, /A Vertical reach under the search radius keeps it near the samples\./);
  assert.match(s, /tr\("Vertical reach \(m\)"\)/);
});

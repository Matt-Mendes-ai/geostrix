// TASKS.csv #2624 (review #2325, WA uranium; split from #2470) — the implicit model's lithology block: per-axis counts from the box's
// shape at the Resolution slider's total, each in the engine's 4-96; the box, the three cell sizes and the mesh cell said before the run
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { axisResolution, blockCellsM, RES_MIN, RES_MAX } from "../src/lib/modelResolution.js";
import { octreeCellM } from "../src/lib/viewer/contactFit.js";

const prod = (r) => r[0] * r[1] * r[2];

test("a cube keeps n x n x n; a flat wide box gets more cells across than down, at about the same total", () => {
  assert.deepEqual(axisResolution([0, 1000, 0, 1000, 0, 1000], 36), [36, 36, 36]);
  assert.deepEqual(axisResolution([-50, 50, 0, 100, 10, 110], 64), [64, 64, 64]);
  // the WA uranium box: 13 x 13 km x 150 m. 36^3 gave 361 x 361 x 4 m cells
  const wa = [0, 13000, 0, 13000, 0, 150], r = axisResolution(wa, 36);
  assert.deepEqual(r, [96, 96, 5]);
  assert.ok(prod(r) <= 36 ** 3 && prod(r) > 0.95 * 36 ** 3, String(prod(r)));
  assert.deepEqual(blockCellsM(wa, r).map(Math.round), [135, 135, 30]);
  // an elongated box: cells close to cubic
  const e = [0, 2000, 0, 500, 0, 800], q = axisResolution(e, 36), c = blockCellsM(e, q);
  assert.ok(Math.max(...c) / Math.min(...c) < 1.1, c.join(" "));
  assert.ok(prod(q) <= 36 ** 3 && prod(q) > 0.97 * 36 ** 3);
  // a tall box (a deep porphyry column)
  const t = axisResolution([0, 500, 0, 500, 0, 3000], 36);
  assert.equal(t[2], 96); assert.ok(t[0] === t[1] && t[0] < 36);
});

test("every count is inside the engine's 4-96 and never above the total; degenerate boxes do not break it", () => {
  for (const ext of [[0, 1e5, 0, 10, 0, 1], [0, 1, 0, 1, 0, 1e5], [0, 0, 0, 0, 0, 0], [5, 5, 0, 100, 0, 100]]) {
    for (const n of [12, 36, 64]) {
      const r = axisResolution(ext, n);
      assert.ok(r.every((k) => Number.isInteger(k) && k >= RES_MIN && k <= RES_MAX), `${ext} ${n}: ${r}`);
      assert.ok(prod(r) <= Math.max(n ** 3, RES_MIN ** 3), `${ext} ${n}: ${r}`);
    }
  }
});

test("the runs send the shaped counts and say the box, the block cells and the mesh cell first; the panel says what the last box got", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /const resolution = axisResolution\(extent, modelResolution\);/);
  assert.doesNotMatch(s, /\[modelResolution, modelResolution, modelResolution\]/);
  assert.equal((s.match(/\{ resolution: resolution, relation/g) || []).length, 2); // the model and its sensitivity realisations
  assert.match(s, /the lithology block is \{nx\} x \{ny\} x \{nz\} cells of \{dx\} x \{dy\} x \{dz\} m/);
  assert.ok(s.indexOf("the lithology block is {nx}") < s.indexOf("await pythonImplicitModel(") /* #2905: the layer-cake branch comes first in the same statement */);
  assert.match(s, /blockCellM: blockCellsM\(extent, resolution\)/);
  assert.equal(Math.round(octreeCellM([0, 13000, 0, 13000, 0, 150], 4)), 813); // the mesh cell the notice states (Standard)
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /the last box got \{nx\} x \{ny\} x \{nz\} cells of/);
});

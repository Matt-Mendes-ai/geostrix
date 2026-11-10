// TASKS.csv #2377 (review #2325, WA uranium) — the model box's vertical pad comes from the drilled column, not the lateral span
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reachPad, verticalPad } from "../src/lib/contactReach.js";
import { MODEL_EXTENT_PAD_M } from "../src/lib/viewer/modelHelpers.js";

test("a flat unit in a thin drilled column gets tens of metres of height, not kilometres", () => {
  // WA-like: contacts of one unit spread over 22 m of RL, holes from RL 347 down to RL 241 (106 m), a 13 km footprint, a 1,130 m lateral margin
  const before = reachPad(22, 13000, 1130, MODEL_EXTENT_PAD_M);
  assert.equal(before, 1130); // what z got: the lateral margin
  const z = verticalPad(22, 106, MODEL_EXTENT_PAD_M);
  assert.equal(z, 53); // half the drilled column
  assert.ok(22 + 2 * z < 200);
});

test("floors and the cap; no traces keeps the old pad", () => {
  assert.equal(verticalPad(5, 10, MODEL_EXTENT_PAD_M), 20); // at least 20 m
  assert.equal(verticalPad(1000, 400, MODEL_EXTENT_PAD_M), 200); // half the column beats 15 % of the contacts' height (150)
  assert.equal(verticalPad(3000, 3000, MODEL_EXTENT_PAD_M), MODEL_EXTENT_PAD_M); // capped like the lateral pad
  assert.equal(verticalPad(22, 0, MODEL_EXTENT_PAD_M), null);
  assert.equal(verticalPad(22, NaN, MODEL_EXTENT_PAD_M), null);
});

test("the run pads z with it (box spans the whole drilled column too), and keeps reachPad for x / y and under a trend", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /const colR = \(reachLib\?\.drilledColumn \? reachLib\.drilledColumn\(allApiPts, \{ xmin, xmax, ymin, ymax \}\) : null\) \|\| zr, vPad = !anisotropy\.enabled && reachLib\?\.verticalPad \? reachLib\.verticalPad\(zr\.max - zr\.min, colR\.max - colR\.min, MODEL_EXTENT_PAD_M\) : null;/);
  assert.match(m, /const \[zmin, zmax\] = vPad != null \? \[Math\.min\(zr\.min, colR\.min\) - vPad, Math\.max\(zr\.max, colR\.max\) \+ vPad\] : pad\(zr\.min, zr\.max\);/);
  assert.match(m, /const \[xmin, xmax\] = pad\(xr\.min, xr\.max\);/);
});

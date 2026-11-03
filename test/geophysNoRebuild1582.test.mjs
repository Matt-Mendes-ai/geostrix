// TASKS.csv #1582 (review #1497, Lawyers) — geophysics readings do not rebuild the drillholes; the Keep default counts them
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suggestKeepEvery } from "../src/lib/xyzBatch.js";

const src = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("with holes the big build depends on the layers except geophys_pts", () => {
  assert.ok(src.includes('if (prev && Object.keys({ ...prev, ...layers }).every((k) => k === "geophys_pts" || prev[k] === layers[k])) return prev;'));
  assert.ok(src.includes(", noHoles ? layers : layersForBuild /* #1582 */, customLayers,"));
});

test("the Keep default leaves room for what the project already draws", () => {
  assert.equal(suggestKeepEvery(85439), 1, "an empty project keeps every reading");
  assert.equal(suggestKeepEvery(85439, 100000, 23580), 2, "with 23,580 already drawn: every 2nd");
  assert.equal(suggestKeepEvery(85439, 100000, 250000), 5, "never under a fifth of the target: every 5th");
  assert.equal(suggestKeepEvery(11000, 100000, 250000), 1, "a small survey still comes in whole");
});

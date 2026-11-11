// TASKS.csv #2410 (review #2325, WA uranium) — a patchy terrain (a collar TIN, 88 % of its grid empty) no longer costs Model from map its mapped
// contacts: off the terrain they go to the map layer's own elevation, counted; and the surfaces are cut at that elevation there too
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelGround } from "../src/lib/modelGround.js";

// a 3 x 3 terrain at RL 300 with its east column empty (NaN), over 0-200 x 0-200
const terrain = { name: "TIN", bbox: [0, 0, 200, 200], gridW: 3, gridH: 3, elevations: [300, 300, NaN, 300, 300, NaN, 300, 300, NaN] };

test("the ground falls back to the flat elevation where the terrain has no data, and beyond it; without a fallback, as before", () => {
  const g = modelGround(terrain, [], [], { fallbackZ: 331 }).ground;
  assert.equal(g.at(10, 10), 300); // on the terrain
  assert.equal(g.at(195, 100), 331); // in its gap
  assert.equal(g.at(900, 900), 331); // beyond it
  assert.equal(g.bbox[0], -Infinity); // so the cut covers the whole model
  const plain = modelGround(terrain, [], []).ground;
  assert.ok(Number.isNaN(plain.at(195, 100)));
  assert.deepEqual(plain.bbox, [0, 0, 200, 200]);
});

test("the map model places off-terrain contacts at the layer's elevation, says so, and cuts at it", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const ground = \(x, y\) => \{ const g = terrainGroundAt\(terrain, x, y\); if \(Number\.isFinite\(g\) \|\| planZ == null\) return g; onPlan\+\+; return planZ; \};/);
  assert.match(r, /were placed at the map layer's elevation \(RL \{z\}\); the surfaces are cut there at that elevation too/);
  assert.match(r, /\.\.\.\(planZ != null \? \{ groundFallbackZ: planZ \} : \{\}\)/);
  assert.match(r, /modelGround\(clipTerrain, collars, survey, \{ fallbackZ: stackOpts\.groundFallbackZ \}\)/);
});

// TASKS.csv #2470 (review #2325, WA uranium) — with no terrain a GemPy model is cut at the collar surface (not for underground collars),
// and a box far taller than its drilling is said
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelGround, boxTallerThanDrilling } from "../src/lib/modelGround.js";

const collars = [[0, 0, 320], [100, 0, 330], [0, 100, 340], [100, 100, 350]].map(([x, y, z], i) => ({ hole_id: `H${i}`, x, y, z, dip: 90 }));

test("the collar surface stands in for the terrain", () => {
  const g = modelGround(null, collars);
  assert.equal(g.kind, "collars");
  assert.equal(g.collars, 4);
  assert.deepEqual(g.ground.bbox, [0, 0, 100, 100]);
  assert.ok(Math.abs(g.ground.at(0, 0) - 320) < 1e-6);
  const z = g.ground.at(50, 50);
  assert.ok(z > 320 && z < 350, String(z));
});

test("a terrain wins; too few or underground collars cut nothing", () => {
  const terrain = { name: "DEM", bbox: [0, 0, 1, 1] };
  assert.equal(modelGround(terrain, collars).kind, "terrain");
  assert.equal(modelGround(null, collars.slice(0, 2)).ground, null);
  const up = collars.map((c, i) => (i < 2 ? { ...c, dip: -30 } : c)); // two holes drilled upward
  assert.equal(modelGround(null, up).why, "underground");
});

test("a box more than 3x taller than the drilling", () => {
  const traces = [{ pts: [{ y: 0 }, { y: -60 }] }, { pts: [{ y: 10 }, { y: -40 }] }]; // 70 m drilled
  assert.equal(boxTallerThanDrilling([0, 1, 0, 1, -100, 50], traces), null); // 150 m: 2.1x
  const t = boxTallerThanDrilling([0, 1, 0, 1, -1000, 100], traces);
  assert.ok(t && Math.abs(t.ratio - 1100 / 70) < 1e-9);
});

test("runSurfaceStack cuts at that ground and says so", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /modelGround\(clipTerrain, collars, survey, \{ fallbackZ: stackOpts\.groundFallbackZ \}\)/); // #2410: a map model's flat fallback
  assert.match(s, /const groundOf = clipGround\.at;/);
  assert.match(s, /cut at the collar surface: the ground interpolated between the \{n\} collars/);
  assert.doesNotMatch(s.slice(s.indexOf("const runSurfaceStack"), s.indexOf("const runImplicitModel")), /terrainGroundAt\(clipTerrain/);
});

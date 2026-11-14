// TASKS.csv #3406 — the Maps plan's pads (collarPads, #3397) take their metre test from groupPads (lib/padGroups.js, the 3D View's #3399):
// one pad grouping for both views; the screen tests (closer than SEP_PX: one pad; farther than PAD_MAX_PX: apart) as before.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarPads, PAD_M } from "../src/lib/collarCallouts.js";
import { groupPads } from "../src/lib/padGroups.js";

test("three holes of one pad (within 5 m) at 4 px a metre: one pad by the metre test; a hole 9 m (36 px) off: its own", () => {
  const world = [{ x: 0, y: 0 }, { x: 3, y: 1 }, { x: -2, y: 3 }, { x: 9, y: 0 }];
  const screen = world.map((w) => ({ x: 100 + 4 * w.x, y: 100 - 4 * w.y }));
  assert.deepEqual(collarPads(world, screen, 0.25).map((p) => p.members), [[0, 1, 2], [3]]);
  assert.deepEqual(groupPads(world, PAD_M).map((g) => g.map((w) => world.indexOf(w))), [[0, 1, 2], [3]], "the same metre groups");
});

test("holes without a plan position still group on screen only; off-view holes are left out", () => {
  const world = [{ x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
  const screen = [{ x: 100, y: 100 }, { x: 105, y: 100 }, { x: NaN, y: NaN }];
  assert.deepEqual(collarPads(world, screen, 1).map((p) => p.members), [[0, 1]], "5 px apart: one pad by the screen test");
});

test("wiring", () => {
  const s = fs.readFileSync(new URL("../src/lib/collarCallouts.js", import.meta.url), "utf8");
  assert.match(s, /groupPads\(pts, padM\)\.forEach\(\(g, k\) => \{ for \(const p of g\) metreGroup\[p\.i\] = k; \}\);/);
  assert.match(s, /return metreGroup\[i\] >= 0 && metreGroup\[i\] === metreGroup\[j\];/);
});

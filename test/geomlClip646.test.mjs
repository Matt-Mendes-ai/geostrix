// TASKS.csv #646 — geoML blocks above the ground or far from data are left out
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGround, makeNearData, clipBlocks } from "../src/lib/geomlClip.js";

// a terrain sloping 1:1 eastward: z = 1000 + x over x 0..100, y 0..100 (row 0 = north)
const terrain = { bbox: [0, 0, 100, 100], gridW: 2, gridH: 2, elevations: [1000, 1100, 1000, 1100] };

test("ground: the terrain where it covers the block, else a surface through the collars", () => {
  const g = makeGround({ terrain, collars: [{ x: 500, y: 50, z: 700 }, { x: 600, y: 50, z: 900 }] });
  assert.equal(g(50, 50), 1050);
  assert.equal(g(500, 50), 700); // outside the terrain: on a collar
  const mid = g(550, 50); assert.ok(mid > 700 && mid < 900);
  assert.ok(Number.isNaN(makeGround({ terrain: null, collars: [] })(1, 1)));
});

test("near data: within maxDist in 3D", () => {
  const near = makeNearData([[0, 0, 0], [500, 0, 0]], 100);
  assert.equal(near(60, 60, 0), true);
  assert.equal(near(80, 80, 0), false);
  assert.equal(near(500, 0, -99), true);
});

test("clip: above-ground first, then far from data; the rest kept", () => {
  const ground = makeGround({ terrain, collars: [] });
  const near = makeNearData([[50, 50, 900]], 150);
  const blocks = [{ x: 50, y: 50, z: 1100 }, { x: 50, y: 50, z: 950 }, { x: 50, y: 50, z: 500 }, { x: 0, y: 0, z: 1200 }];
  const r = clipBlocks(blocks, { ground, near });
  assert.deepEqual(r.keep, [false, true, false, false]);
  assert.equal(r.air, 2); assert.equal(r.far, 1);
});

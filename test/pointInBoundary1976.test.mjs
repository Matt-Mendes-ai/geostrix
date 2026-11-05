// TASKS.csv #1976 — a point inside a hole of a boundary is outside it; an island in the hole is inside; parts that overlap without
// nesting keep their overlap inside
import test from "node:test";
import assert from "node:assert/strict";
import { pointInBoundary } from "../src/lib/pointInPolygon.js";
const sq = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

test("#1976 holes, islands and overlaps", () => {
  const donut = [sq(0, 0, 100), sq(25, 25, 50)];
  assert.equal(pointInBoundary(10, 10, donut), true);
  assert.equal(pointInBoundary(50, 50, donut), false); // in the hole
  assert.equal(pointInBoundary(150, 50, donut), false);
  const island = [sq(0, 0, 100), sq(25, 25, 50), sq(40, 40, 20)];
  assert.equal(pointInBoundary(50, 50, island), true);
  assert.equal(pointInBoundary(30, 30, island), false);
  const overlap = [sq(0, 0, 100), sq(50, 0, 100)];
  assert.equal(pointInBoundary(75, 50, overlap), true); // in both parcels
  assert.equal(pointInBoundary(10, 10, [sq(0, 0, 100), [{ x: 0, y: 0 }, { x: 5, y: 5 }]]), true); // a 2-point line ignored
  assert.equal(pointInBoundary(1, 1, []), false);
  assert.equal(pointInBoundary(1, 1, null), false);
});

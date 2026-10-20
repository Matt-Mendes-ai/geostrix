// TASKS.csv #539 — slope-chained electrode positions converted to horizontal distance.
import test from "node:test";
import assert from "node:assert/strict";
import { slopeToHorizontalFromProfile, slopeToHorizontalFromStations, readingsToHorizontal } from "../src/lib/dcip.js";

test("#539 on a uniform 30° slope, 400 m chained is 346.4 m horizontal (54 m less)", () => {
  const t = Math.tan(Math.PI / 6);
  const prof = Array.from({ length: 101 }, (_, i) => { const h = -200 + i * 10; return [h, 1000 - h * t]; });
  const f = slopeToHorizontalFromProfile(prof);
  assert.ok(Math.abs(f(400) - 400 * Math.cos(Math.PI / 6)) < 1e-6, String(f(400)));
  assert.ok(Math.abs(f(0)) < 1e-9);
  assert.ok(Math.abs(f(-100) + 100 * Math.cos(Math.PI / 6)) < 1e-6); // before the start too
  const { readings, maxShift } = readingsToHorizontal([[0, null, 400, 500]], f);
  assert.equal(readings[0][1], null); assert.ok(Math.abs(readings[0][2] - 346.41) < 0.01);
  assert.ok(Math.abs(maxShift - 500 * (1 - Math.cos(Math.PI / 6))) < 0.01);
  // flat ground: identity
  const g = slopeToHorizontalFromProfile([[-10, 5], [1000, 5]]);
  assert.ok(Math.abs(g(700) - 700) < 1e-9);
});

test("#539 from stations: true horizontal distance of each station along the fitted line", () => {
  // stations every 100 m chained, only 90 m apart horizontally, line along +x from (1000, 0)
  const st = [0, 100, 200, 300].map((s) => ({ s, x: 1000 + 0.9 * s, y: 0 }));
  const f = slopeToHorizontalFromStations(st, [1000, 0], [1, 0]);
  assert.ok(Math.abs(f(150) - 135) < 1e-9);
  assert.ok(Math.abs(f(400) - 360) < 1e-9); // beyond: the end segment's ratio
  assert.equal(slopeToHorizontalFromStations([st[0]], [0, 0], [1, 0]), null);
});

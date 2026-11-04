// TASKS.csv #1924 (review #1918, Lawyers) — a pass is a vector: between a spiral's stacked turns the rock left is back to floor
// (the profile's height is what is taken off), beside another drift it is wall to wall (the width); the figures follow the direction
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLine, selfClearance, clearanceTo, passDirection, profileHalfAlong } from "../src/lib/designLines.js";

// a spiral of two turns at R 20 and 10 %: each turn sits 12.57 m over the one below, so the self pass is vertical
const spiral = computeLine({ start: { x: 0, y: 0, z: 0 }, azimuth: 0, segments: [{ type: "curve", radius: 20, turn: "right", angle: 720, grade: 10 }] });
const drop = 2 * Math.PI * 20 * 0.1;
// a straight drift, and another 12 m beside it at its level: the pass is horizontal
const straight = computeLine({ start: { x: 0, y: 0, z: 0 }, azimuth: 90, segments: [{ type: "straight", length: 100, grade: 0 }] });
const beside = { name: "beside", vertices: [[0, 12, 0], [100, 12, 0]] };
const profile = { width: 5, height: 6 };

test("the self pass between stacked turns is vertical, and the height comes off, not the width", () => {
  const s = selfClearance(spiral);
  assert.ok(Math.abs(s.distance - drop) < 0.5, String(s.distance));
  assert.ok(s.from && s.at);
  const d = passDirection(s);
  assert.ok(d.vertical > 0.95, String(d.vertical));
  const half = profileHalfAlong(s, profile);
  assert.ok(half > 2.9 && half < 3.5, String(half)); // about half the 6 m height (the helix's pitch adds a little width), not half the 5 m width
  assert.ok(s.distance - 2 * half < drop - 5.8); // a full height (6 m) comes off, where the width took 5
});

test("a pass beside another line is horizontal, and the width comes off", () => {
  const c = clearanceTo(straight, [beside], 100);
  assert.ok(Math.abs(c.distance - 12) < 1e-9 && c.name === "beside");
  const d = passDirection(c);
  assert.ok(d.horizontal > 0.99 && d.vertical < 0.01);
  assert.ok(Math.abs(profileHalfAlong(c, profile) - 2.5) < 1e-9); // half the 5 m width
});

test("a diagonal pass takes a share of each; no profile takes nothing; no height is taken as the width", () => {
  const diag = { from: [0, 0, 0], at: [3, 0, 4] }; // 3 across, 4 up
  const d = passDirection(diag);
  assert.ok(Math.abs(d.horizontal - 0.6) < 1e-9 && Math.abs(d.vertical - 0.8) < 1e-9);
  assert.ok(Math.abs(profileHalfAlong(diag, profile) - (2.5 * 0.6 + 3 * 0.8)) < 1e-9);
  assert.equal(profileHalfAlong(diag, null), 0);
  assert.ok(Math.abs(profileHalfAlong(diag, { width: 4 }) - (2 * 0.6 + 2 * 0.8)) < 1e-9);
  assert.deepEqual(passDirection({ from: [1, 1, 1], at: [1, 1, 1] }), { horizontal: 1, vertical: 0 }); // a crossing: the width
});

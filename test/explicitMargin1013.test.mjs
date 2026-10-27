// TASKS.csv #1013 — the automatic margin of an explicit surface: 15 % of the inputs' shorter span (at least a quarter of
// 15 % of the longer), not 15 % of the longest; a fault-block surface keeps the long reach so it meets its fault
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface } from "../src/lib/explicitSurface.js";

// a steep (75 deg) contact picked over 800 m along strike: its down-dip span in its own plane is ~2,300 m
const picks = [];
for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) { const x = 500000 + i * 110, y = 6200000 + j * 150; picks.push({ x, y, z: 1000 - (y - 6200000) * Math.tan((75 * Math.PI) / 180), src: "pick" }); }

test("#1013 a steep strip of picks gets a margin from its shorter span; 'long' and an explicit margin are as before", () => {
  const short = fitExplicitSurface(picks, { resolution: 40 });
  const long = fitExplicitSurface(picks, { resolution: 40, marginBasis: "long" });
  assert.ok(Math.abs(short.margin - 0.15 * 770) < 1, `${short.margin}`); // the along-strike span (7 x 110 m)
  assert.ok(long.margin > 2 * short.margin, `${long.margin} vs ${short.margin}`);
  assert.ok(short.quality.beyondPct < long.quality.beyondPct);
  assert.equal(fitExplicitSurface(picks, { resolution: 40, margin: 50 }).margin, 50);
});

test("#1013 a narrow strip still reaches past its ends (a quarter of the long span's 15 %)", () => {
  const strip = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) strip.push({ x: i * 50, y: j * 30, z: 100 + i, src: "pick" });
  const res = fitExplicitSurface(strip, { resolution: 40 });
  assert.ok(Math.abs(res.margin - (0.15 * 950) / 4) < 1e-6, `${res.margin}`);
});

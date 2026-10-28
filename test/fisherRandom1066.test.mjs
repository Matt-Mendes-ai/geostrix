// TASKS.csv #1066 — random planes are flagged "no preferred orientation" instead of getting a tight α95 cone
import { test } from "node:test";
import assert from "node:assert/strict";
import { fisherStats } from "../src/lib/stereonet.js";

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const randomPlane = () => { // uniform pole on the lower hemisphere -> dip / dip direction
  const z = -(rnd()), phi = rnd() * 2 * Math.PI, r = Math.sqrt(1 - z * z);
  const plunge = Math.asin(-z) * 180 / Math.PI, trend = (Math.atan2(r * Math.cos(phi), r * Math.sin(phi)) * 180 / Math.PI + 360) % 360;
  return { dip: 90 - plunge, azimuth: (trend + 180) % 360 };
};

test("#1066 random planes: no α95 cone under 10° offered for n <= 1,000 (k sits near 2)", () => {
  for (const n of [20, 100, 729, 1000]) for (let s = 0; s < 20; s++) {
    const st = fisherStats(Array.from({ length: n }, randomPlane));
    assert.ok(st.k < 3.2, `k ${st.k}`);
    if (!st.noPreferred) assert.ok(st.alpha95 >= 10, `n ${n}: α95 ${st.alpha95} offered for random planes`);
    if (n >= 100) assert.equal(st.noPreferred, true);
  }
});

test("#1066 a real cluster is not flagged", () => {
  const st = fisherStats(Array.from({ length: 40 }, () => ({ dip: 60 + (rnd() - 0.5) * 20, azimuth: 120 + (rnd() - 0.5) * 20 })));
  assert.equal(st.noPreferred, false);
  assert.ok(st.k > 30 && st.alpha95 < 5);
});

test("#1066 two concordant picks are 'too few', not 'random' (Bingham needs 4+)", () => {
  assert.equal(fisherStats([{ dip: 60, azimuth: 100 }, { dip: 70, azimuth: 110 }]).noPreferred, false);
});

// TASKS.csv #713 — two or three picks are not a girdle: the stereonet must not call them a fold and lock the trend button.
import test from "node:test";
import assert from "node:assert/strict";
import { fisherStats, fabricShape } from "../src/lib/stereonet.js";

const shape = (picks) => { const f = fisherStats(picks); return fabricShape(f.s1, f.s2, f.s3, f.n).shape; };

test("two picks, two near-identical picks and three clustered picks are 'few', not girdles", () => {
  assert.equal(shape([{ dip: 50, azimuth: 100 }, { dip: 51, azimuth: 101 }]), "few");
  assert.equal(shape([{ dip: 30, azimuth: 90 }, { dip: 30, azimuth: 270 }]), "few");
  assert.equal(shape([{ dip: 45, azimuth: 90 }, { dip: 45.5, azimuth: 90.5 }, { dip: 46, azimuth: 90 }]), "few");
});

test("many near-identical picks are a cluster even when s3 is ~0", () => {
  const picks = Array.from({ length: 12 }, (_, i) => ({ dip: 45 + (i % 2) * 0.3, azimuth: 90 }));
  const f = fisherStats(picks);
  assert.ok(f.s2 < 0.05);
  assert.equal(fabricShape(f.s1, f.s2, f.s3, f.n).shape, "cluster");
});

test("a real fold with enough picks is still a girdle", () => {
  const limbs = [...Array(5).fill({ dip: 30, azimuth: 90 }), ...Array(5).fill({ dip: 30, azimuth: 270 })];
  assert.equal(shape(limbs), "girdle");
});

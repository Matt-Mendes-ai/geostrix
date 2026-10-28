// TASKS.csv #1130 — alpha-only picks on sections: a fan of possible apparent dips and the most likely one
import { test } from "node:test";
import assert from "node:assert/strict";
import { alphaOnlyFan, apparentDipOn, meanPole } from "../src/lib/sectionStructures.js";
import { orientFromAlphaBeta } from "../src/lib/coreOrientation.js";

test("#1130 apparent dip: full dip along the dip direction, 0 along strike, sign by direction", () => {
  assert.ok(Math.abs(apparentDipOn(60, 90, 90) - 60) < 1e-9);
  assert.ok(Math.abs(apparentDipOn(60, 90, 0)) < 1e-9);
  assert.ok(apparentDipOn(60, 270, 90) < 0);
});

test("#1130 the fan contains the true plane's apparent dip; the prior picks it", () => {
  // a vertical hole: alpha 30 -> planes dipping 60, any dip direction
  const truth = orientFromAlphaBeta({ alphaDeg: 30, betaDeg: 120, holeAzDeg: 0, holeDipDeg: 80 });
  const trueAd = apparentDipOn(truth.dipDeg, truth.dipDirDeg, 45);
  const prior = meanPole([{ dip: truth.dipDeg, azimuth: truth.dipDirDeg }, { dip: truth.dipDeg + 3, azimuth: truth.dipDirDeg - 4 }]);
  const r = alphaOnlyFan(30, 0, 80, 45, prior);
  assert.equal(r.fan.length, 36);
  assert.ok(Math.min(...r.fan.map((a) => Math.abs(a - trueAd))) < 6);
  assert.equal(r.likelyFrom, "prior");
  assert.ok(Math.abs(r.likely - trueAd) < 8, `${r.likely} vs ${trueAd}`);
  assert.equal(alphaOnlyFan(30, 0, 80, 45, null).likelyFrom, "fan");
  assert.equal(alphaOnlyFan(NaN, 0, 80, 45), null);
});

test("#1130 no prior from a population with no fabric", () => {
  let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const random = Array.from({ length: 400 }, () => ({ dip: (Math.acos(rnd()) * 180) / Math.PI, azimuth: rnd() * 360 })); // poles uniform on the hemisphere
  assert.equal(meanPole(random), null);
  assert.equal(meanPole([]), null);
});

// TASKS.csv #574 — Terzaghi on a mixed drillhole + outcrop set must not re-weight one population against the other.
import test from "node:test";
import assert from "node:assert/strict";
import { fisherStats, roseDiagramBins, terzaghiWeight, alphaAngle } from "../src/lib/stereonet.js";

const TZ = { terzaghi: { enabled: true, maxWeight: 8 } };
// a drillhole set at low alpha (weight ~5.8 each) and an outcrop set with no hole attitude
const A = Array.from({ length: 10 }, () => ({ dip: 60, azimuth: 0, holeAz: 0, holeDip: 50 }));
const B = Array.from({ length: 10 }, () => ({ dip: 60, azimuth: 90, outcrop: true }));

test("#574 equal-alpha drillhole picks + outcrop: the corrected mean equals the uncorrected one", () => {
  assert.ok(terzaghiWeight(alphaAngle(0, 60, 0, 50)) > 5); // the old code counted each drillhole pick ~5.8x
  const off = fisherStats([...A, ...B]);
  const on = fisherStats([...A, ...B], TZ);
  assert.ok(Math.abs(on.meanTrend - off.meanTrend) < 1e-6, `${on.meanTrend} vs ${off.meanTrend}`); // was 183 vs 225
  assert.ok(Math.abs(on.meanPlunge - off.meanPlunge) < 1e-6);
  assert.equal(on.terzaghi.normalisedMixed, true);
});

test("#574 the correction still acts within the drillhole population", () => {
  // two drillhole sets, one crossed at low alpha (under-sampled, up-weighted), plus outcrop
  const low = Array.from({ length: 5 }, () => ({ dip: 60, azimuth: 0, holeAz: 0, holeDip: 50 }));
  const high = Array.from({ length: 5 }, () => ({ dip: 60, azimuth: 180, holeAz: 0, holeDip: 50 }));
  const off = fisherStats([...low, ...high, ...B]);
  const on = fisherStats([...low, ...high, ...B], TZ);
  // the low-alpha set's pole trend is 180: correction pulls the mean toward it, as it should
  const d = (t) => Math.min(Math.abs(t - 180), 360 - Math.abs(t - 180));
  assert.ok(d(on.meanTrend) < d(off.meanTrend), `${on.meanTrend} vs ${off.meanTrend}`);
});

test("#574 drillhole-only sets are unchanged (no normalisation)", () => {
  const on = fisherStats(A, TZ);
  assert.equal(on.terzaghi.normalisedMixed, false);
  assert.ok(on.terzaghi.maxAppliedWeight > 5);
});

test("#574 rose: mixed set petals count each population by its readings", () => {
  const r = roseDiagramBins([...A, ...B], { binSizeDeg: 10, mode: "dipdir", ...TZ });
  const at = (deg) => r.bins.find((b) => deg >= b.from && deg < b.to).count;
  assert.ok(Math.abs(at(0) - 10) < 1e-9 && Math.abs(at(90) - 10) < 1e-9, `${at(0)} / ${at(90)}`);
});

// TASKS.csv #3385 — a trend from the direction table's ranges, checked against a known ellipsoid
import test from "node:test";
import assert from "node:assert/strict";
import { trendFromDirections, trendBasis, cleanTrend } from "../src/lib/trend.js";
import { directionVector, DIRECTION_TABLE, wellFittedDirections, longestDirection } from "../src/lib/variogram.js";

// the range of an ellipsoid with semi-axes (a along u1, b along u2, c along u3) in direction v: 1/sqrt(sum (v.ui/ai)^2)
const rangeOf = (axes, v) => 1 / Math.sqrt(axes.reduce((s, [u, a]) => s + ((v.x * u.x + v.y * u.y + v.z * u.z) / a) ** 2, 0));
test("recovers the major axis and the ranges of a known ellipsoid (a 60 deg plunging, 400 / 200 / 100 m)", () => {
  const truth = cleanTrend({ dip: 50, dipAzimuth: 110, pitch: 70, ratios: { max: 400, int: 200, min: 100 } });
  const b = trendBasis(truth);
  const axes = [[b.major, 400], [b.semiMajor, 200], [b.minor, 100]];
  const rows = DIRECTION_TABLE.map((d) => ({ ...d, nPairs: 500, range: rangeOf(axes, directionVector(d.azimuth, d.dip)), rSquared: 0.9, maxReliableLag: 0 }));
  assert.equal(wellFittedDirections(rows).length, rows.length);
  const t = trendFromDirections(wellFittedDirections(rows), directionVector);
  assert.ok(t);
  // the recovered major axis is within the table's 30 deg grid of the true one (it is built from the table's own directions)
  const tb = trendBasis(t), dotv = Math.abs(tb.major.x * b.major.x + tb.major.y * b.major.y + tb.major.z * b.major.z);
  assert.ok(dotv > Math.cos(35 * Math.PI / 180), `major axis off by ${(Math.acos(Math.min(1, dotv)) * 180 / Math.PI).toFixed(1)} deg`);
  assert.ok(t.ratios.max >= t.ratios.int && t.ratios.int >= t.ratios.min);
  assert.ok(t.ratios.max / t.ratios.min > 2, "an anisotropic body reads as anisotropic");
});
test("an isotropic table, a single direction and near-parallel extremes give no trend", () => {
  const iso = DIRECTION_TABLE.map((d) => ({ ...d, nPairs: 500, range: 300, rSquared: 0.9, maxReliableLag: 0 }));
  assert.equal(trendFromDirections(iso.slice(0, 1), directionVector), null);
  // two directions 10 degrees apart: not enough to say a plane
  assert.equal(trendFromDirections([{ azimuth: 0, dip: 0, range: 400 }, { azimuth: 10, dip: 0, range: 100 }], directionVector), null);
  assert.equal(longestDirection(iso).range, 300);
});
test("the axes of a trend built from two square directions are exactly those directions", () => {
  const t = trendFromDirections([{ azimuth: 90, dip: 0, range: 500 }, { azimuth: 0, dip: 0, range: 100 }, { azimuth: 0, dip: 90, range: 50 }], directionVector);
  const b = trendBasis(t);
  assert.ok(Math.abs(Math.abs(b.major.x) - 1) < 1e-9, "major along east");
  assert.ok(Math.abs(Math.abs(b.minor.z) - 1) < 1e-9, "minor vertical");
  assert.deepEqual([t.ratios.max, t.ratios.min], [10, 1]); // #3787 — ratios (500 : 50 m), min = 1
});

import fs from "node:fs";
test("wiring: the table's trend button, and the Grade x thickness help '?' and the four-panel wording (#3385, #3452, #3453)", () => {
  const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src("../src/components/VariogramModal.jsx"), /trendFromDirections\(wellFittedDirections\(dirTable\.rows\), directionVector\)/);
  const g = src("../src/components/GradeThicknessModal.jsx");
  assert.match(g, /openHelp\("grade-thickness"\)/);
  assert.match(g, /or four with the kriging standard deviation/);
});

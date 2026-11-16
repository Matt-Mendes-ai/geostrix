// TASKS.csv #3786 / #3787 / #3789 (Scottie Gold, Variogram): no anisotropy from a weak fit or inclined holes; the direction table follows the pairs shown; a raw nuggety variogram says how few pairs carry it
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { anisotropyFromFits } from "../src/lib/estimateMemory.js";
import { experimentalVariogram } from "../src/lib/variogram.js";
import { trendFromDirections, trendBasis, cleanTrend } from "../src/lib/trend.js";
import { DIRECTION_TABLE, directionVector, wellFittedDirections } from "../src/lib/variogram.js";

test("#3786: 60 m across against 6 m down from a fit of r² 0.04 is no anisotropy; inclined holes offer no flat search", () => {
  const weak = anisotropyFromFits({ range: 6, rSquared: 0.93 }, { range: 60, rSquared: 0.04 });
  assert.equal(weak.weak, true); assert.equal(weak.weakFit, "across"); assert.equal(weak.flat, false);
  const inclined = anisotropyFromFits({ range: 6, rSquared: 0.93 }, { range: 60, rSquared: 0.8 }, { vertical: false });
  assert.equal(inclined.flat, false); assert.equal(inclined.inclined, true);
  const good = anisotropyFromFits({ range: 6, rSquared: 0.93 }, { range: 60, rSquared: 0.8 }, { vertical: true });
  assert.equal(good.flat, true);
  assert.equal(anisotropyFromFits({ range: 100 }, { range: 150 }).flat, false, "close ranges: still a sphere");
});
test("#3787: a trend from the direction table is stored as ratios (min = 1), not as ranges in metres", () => {
  const rangeOf = (axes, v) => 1 / Math.sqrt(axes.reduce((s, [u, a]) => s + ((v.x * u.x + v.y * u.y + v.z * u.z) / a) ** 2, 0));
  const b = trendBasis(cleanTrend({ dip: 50, dipAzimuth: 110, pitch: 70, ratios: { max: 400, int: 200, min: 100 } }));
  const axes = [[b.major, 400], [b.semiMajor, 200], [b.minor, 100]];
  const rows = DIRECTION_TABLE.map((d) => ({ ...d, nPairs: 500, range: rangeOf(axes, directionVector(d.azimuth, d.dip)), rSquared: 0.9, maxReliableLag: 0 }));
  const t = trendFromDirections(wellFittedDirections(rows), directionVector);
  assert.equal(t.ratios.min, 1); assert.ok(t.ratios.max < 10 && t.ratios.max > 2, `max ${t.ratios.max}`);
});
test("#3787 wired: the table is offered only when the Pairs and transform shown are the last computed ones", () => {
  const v = fs.readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /result\.holeMode === holeMode && result\.transform === transform && <div/);
  assert.match(v, /Compute again first/);
});
test("#3789: each lag reports the share of its semivariance carried by its ten largest pairs (raw nuggety gold: a few high pairs)", () => {
  // 200 composites on a line, 2 m apart: values mostly 0.01, five at 30
  const points = Array.from({ length: 200 }, (_, i) => ({ x: 0, y: 0, z: -i * 2, hole_id: "H1", value: i % 40 === 0 ? 30 : 0.01 }));
  const vg = experimentalVariogram(points, { lagDistance: 2, nLags: 4, holeMode: "downhole" });
  const b = vg.bins[0];
  assert.ok(b.nPairs > 100 && b.top10Share > 0.5, `top10Share ${b.top10Share}`);
  // an even-valued variable: no single pair dominates
  const even = Array.from({ length: 200 }, (_, i) => ({ x: 0, y: 0, z: -i * 2, hole_id: "H1", value: 1 + Math.sin(i / 3) }));
  const e = experimentalVariogram(even, { lagDistance: 2, nLags: 4, holeMode: "downhole" }).bins[0];
  assert.ok(e.top10Share < 0.3, `even top10Share ${e.top10Share}`);
});
test("#3789 wired: the note and the estimate's uncapped-model remark", () => {
  const v = fs.readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /This raw variogram rests on a few high pairs/);
  const e = fs.readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /The model was fitted to uncapped values and this run caps at \{cap\}/);
});

// TASKS.csv #2424 (review #2325, WA uranium) — on a layered deposit 'Between holes only' paired every composite of one hole with every
// composite of the next at any depth, across the stratigraphy (100 % nugget), and a direction with a band kept too few pairs: the horizontal
// range was out of reach. Pairs may now be taken in a plane, every azimuth, within ± a half-width across it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { experimentalVariogram } from "../src/lib/variogram.js";
import { trendBasis, cleanTrend } from "../src/lib/trend.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// 10 x 10 vertical holes 50 m apart; two flat 2 m layers 10 m apart: the lower one carries grade that varies slowly east-west (a
// 600 m wavelength), the upper one is barren; 1 m composites
function layered() {
  const pts = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const x = i * 50, y = j * 50, id = `H${i}_${j}`;
    for (const z of [100.5, 101.5]) pts.push({ hole_id: id, x, y, z, value: 0.1 });
    for (const z of [90.5, 91.5]) pts.push({ hole_id: id, x, y, z, value: 50 + 40 * Math.sin((2 * Math.PI * x) / 600) });
  }
  return pts;
}

test("#2424: in the bedding plane the variogram sees the lateral continuity that 'between holes' mixes away", () => {
  const pts = layered();
  const between = experimentalVariogram(pts, { lagDistance: 50, nLags: 6, holeMode: "between" });
  const plane = experimentalVariogram(pts, { lagDistance: 50, nLags: 6, holeMode: "between", direction: { plane: { normal: { x: 0, y: 0, z: 1 }, halfWidth: 1 } } });
  const g = (vg, k) => vg.bins[k].gamma;
  // across the layers every lag is dominated by the barren-vs-ore contrast: near the sill from the first lag
  assert.ok(g(between, 0) > 0.6 * between.variance, `between ${g(between, 0)} vs variance ${between.variance}`);
  // in the plane the first lag is a small part of the variance and gamma grows with the lag
  assert.ok(g(plane, 0) < 0.15 * between.variance, `plane first lag ${g(plane, 0)}`);
  assert.ok(g(plane, 5) > 3 * g(plane, 0), `plane grows: ${g(plane, 0)} -> ${g(plane, 5)}`);
  assert.ok(plane.bins[0].nPairs >= 30, "enough pairs");
  assert.ok(plane.nPairsUsed < between.nPairsUsed);
});

test("#2424: the half-width is across the plane; a tilted plane follows its normal", () => {
  const pts = [{ hole_id: "A", x: 0, y: 0, z: 0, value: 0 }, { hole_id: "B", x: 50, y: 0, z: 3, value: 1 }];
  const at = (w, normal) => experimentalVariogram(pts, { lagDistance: 50, nLags: 2, direction: { plane: { normal, halfWidth: w } } }).nPairsUsed;
  assert.equal(at(2, { x: 0, y: 0, z: 1 }), 0, "3 m across a horizontal plane: out at ± 2 m");
  assert.equal(at(3.5, { x: 0, y: 0, z: 1 }), 1);
  // a plane dipping so that (50, 0, 3) lies in it: normal perpendicular to that vector
  assert.equal(at(0.1, { x: -3, y: 0, z: 50 }), 1);
  // the trend's minor axis is the normal of its plane: a flat trend's is vertical
  const m = trendBasis(cleanTrend({ dip: 0, dipAzimuth: 0, pitch: 0, ratios: { max: 10, int: 10, min: 1 } })).minor;
  assert.ok(Math.abs(Math.abs(m.z) - 1) < 1e-9, JSON.stringify(m));
});

test("#2424: the dialog offers the plane (the block-estimation trend's, else horizontal), the lags actually used and the composite hint", () => {
  const s = fs.readFileSync(path.join(root, "src", "components", "VariogramModal.jsx"), "utf8");
  assert.match(s, /direction = usePlane \? \{ plane: \{ normal: usePlane\.normal, halfWidth: half \} \}/);
  assert.match(s, /Number\(planeHalf\) > 0 \? Number\(planeHalf\) : compositeLength/, "blank half-width = the composite length");
  assert.match(s, /structuralTrends\?\.use\?\.estimation/);
  assert.match(s, /trendBasis\(trend\)\.minor/);
  assert.ok(s.includes('tr("{n} lags drawn, out to {max} m, to reach the farthest drill site ({typed} typed).",'));
  assert.ok(s.includes('do not follow the {v} shape well') && !s.includes('do not follow a {v} shape'));
});

// TASKS.csv #1576 — a variogram with no sill (a trend, mixed domains) and a range past the measured lags are flagged.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { experimentalVariogram, fitVariogramModel, variogramStationarity } from "../src/lib/variogram.js";

// a 20 x 20 x 3 grid at 10 m; a pseudo-random but repeatable value
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const grid = (f) => { const p = []; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 3; k++) p.push({ x: i * 10, y: j * 10, z: k * 10, value: f(i * 10, j * 10, rnd()) }); return p; };

test("a grade with a strong east-west trend: no sill", () => {
  const vg = experimentalVariogram(grid((x, y, r) => x / 10 + r), { lagDistance: 10, nLags: 14 });
  const st = variogramStationarity(vg, fitVariogramModel(vg.bins));
  assert.equal(st.noSill, true, JSON.stringify(st));
  assert.ok(st.endRatio > 1.15);
  assert.equal(st.rising, true);
});

test("a variogram that levels off above the variance (Lawyers' log Au, 1.27x) is flagged, not 'still rising'", () => {
  const bins = [10, 20, 30, 40, 50, 60].map((h, i) => ({ lag: h, h, nPairs: 500, gamma: [0.008, 0.0105, 0.0128, 0.0135, 0.0133, 0.0132][i] }));
  const st = variogramStationarity({ bins, variance: 0.0105, maxReliableLag: 60 }, { range: 40 });
  assert.equal(st.noSill, true);
  assert.equal(st.rising, false);
  assert.ok(Math.abs(st.endRatio - 1.27) < 0.01);
});

test("white noise: a sill at the variance, no flag", () => {
  const vg = experimentalVariogram(grid((x, y, r) => r), { lagDistance: 10, nLags: 14 });
  const st = variogramStationarity(vg, { range: 30 });
  assert.equal(st.noSill, false, JSON.stringify(st));
  assert.equal(st.rangeBeyond, false);
  assert.equal(variogramStationarity(vg, { range: 10 * st.reliableLagM }).rangeBeyond, true);
});

test("shown in the Variogram tool and in the kriging summary; carried on the fitted variogram", () => {
  assert.match(fs.readFileSync("src/components/VariogramModal.jsx", "utf8"), /const stat = result \? variogramStationarity\(result\.vg, result\.fit\) : null;/);
  assert.match(fs.readFileSync("src/components/GradeEstimationModal.jsx", "utf8"), /result\.variogram\.stationarity\?\.noSill/);
  assert.match(fs.readFileSync("src/lib/estimation.js", "utf8"), /const st = variogramStationarity\(ev, fit\);/);
});

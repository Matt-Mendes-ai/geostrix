// TASKS.csv #1996 (Matt 2026-11-06, the open-geoscience review, section 3.7) — robust variogram estimators beside Matheron: Cressie &
// Hawkins 1980 and Dowd 1984. A few massive-sulphide composites dictate a Matheron sill; the robust ones follow the bulk of the pairs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { experimentalVariogram } from "../src/lib/variogram.js";

// white noise of variance 1 on a line of points 1 m apart (Box-Muller, seeded)
let s = 1996; const u = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const line = (outliers = 0) => Array.from({ length: 3000 }, (_, i) => ({ x: i, y: 0, z: 0, value: gauss() + (i % 100 === 7 && outliers ? outliers : 0) }));
const mean = (vg) => { const g = vg.bins.filter((b) => b.gamma != null).map((b) => b.gamma); return g.reduce((a, b) => a + b, 0) / g.length; };
const opts = { lagDistance: 2, nLags: 10, lagTolerance: 0.5, maxPoints: 3000 };

test("on Gaussian white noise all three estimate the variance", () => {
  const pts = line();
  for (const e of ["matheron", "cressie", "dowd"]) {
    const g = mean(experimentalVariogram(pts, { ...opts, estimator: e }));
    assert.ok(Math.abs(g - 1) < 0.12, `${e}: ${g.toFixed(3)}`);
  }
  assert.equal(experimentalVariogram(pts, opts).estimator, "matheron", "Matheron by default");
});

test("1 % extreme values inflate Matheron, not the robust two", () => {
  const pts = line(30); // 30 standard deviations, one point in a hundred
  const m = mean(experimentalVariogram(pts, { ...opts, estimator: "matheron" }));
  const c = mean(experimentalVariogram(pts, { ...opts, estimator: "cressie" }));
  const d = mean(experimentalVariogram(pts, { ...opts, estimator: "dowd" }));
  assert.ok(m > 5, "Matheron " + m.toFixed(2));
  assert.ok(c < 2 && d < 1.5, `Cressie ${c.toFixed(2)}, Dowd ${d.toFixed(2)}`);
});

test("the dialog offers them", () => {
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /experimentalVariogram\(tPoints, \{ lagDistance: lag, nLags: nLagsUsed, lagTolerance, holeMode, direction, estimator \}\)/);
  assert.match(v, /<option value="cressie">\{tr\("Cressie-Hawkins \(robust\)"\)\}<\/option>/);
  assert.match(v, /<option value="dowd">\{tr\("Dowd \(median, robust\)"\)\}<\/option>/);
});

test("the direction table: the long axis of an anisotropic field has the longest range", async () => {
  const { DIRECTION_TABLE, directionRow } = await import("../src/lib/variogram.js");
  assert.equal(DIRECTION_TABLE.length, 13);
  let t = 7; const r = () => ((t = (t * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) pts.push({ x: i * 10, y: j * 10, z: 0, value: Math.sin((i * 10) / 120) + Math.sin((j * 10) / 15) + 0.05 * r() });
  const base = { lagDistance: 10, nLags: 15, lagTolerance: 0.5, holeMode: "all", estimator: "matheron" };
  const ew = directionRow(pts, base, { azimuth: 90, dip: 0 }), ns = directionRow(pts, base, { azimuth: 0, dip: 0 });
  assert.ok(ew.range != null && ns.range != null, JSON.stringify([ew.range, ns.range]));
  assert.ok(ew.range > 2 * ns.range, `east-west ${Math.round(ew.range)} m vs north-south ${Math.round(ns.range)} m`);
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /rows\.push\(directionRow\(run\.points, run\.base, DIRECTION_TABLE\[i\], run\.model\)\); setDirTable\(\{ rows: \[\.\.\.rows\], done: false \}\); setTimeout\(\(\) => step\(i \+ 1\), 0\);/);
});

test("the long axis is named only from fits that mean something", async () => {
  const { longestDirection } = await import("../src/lib/variogram.js");
  const rows = [
    { azimuth: 30, dip: 0, nPairs: 109175, range: 993, rSquared: 0.10, maxReliableLag: 625 }, // Woodjam Cu: the longest, and no fit
    { azimuth: 90, dip: 45, nPairs: 9973, range: 364, rSquared: 0.77, maxReliableLag: 625 },
    { azimuth: 0, dip: 45, nPairs: 65125, range: 886, rSquared: 0.6, maxReliableLag: 500 }, // 886 m is past 1.5 x its 500 m of reliable lags: left out
  ];
  assert.equal(longestDirection(rows).azimuth, 90);
  assert.equal(longestDirection(rows.slice(0, 1)), null);
});

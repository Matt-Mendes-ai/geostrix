// TASKS.csv #2798 follow-up — drillLineGeometry (the section defaults from the drill lines) and median on 20,000 collars: the same answers,
// without the string grid keys, Math.hypot, spreads or a comparator sort
import test from "node:test";
import assert from "node:assert/strict";
import { drillLineGeometry } from "../src/modules/viewer/drillLines.js";
import { median, quantileLinear } from "../src/lib/arrayStats.js";

test("median and quantiles: finite values only, ascending, the two middle values averaged", () => {
  assert.equal(median([3, 1, NaN, "x", 2, Infinity]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Number.isNaN(median([])));
  assert.equal(quantileLinear([10, 0, 5], 0.25), 2.5);
  assert.equal(median([-0.5, -2, 7]), -0.5);
});

test("fences on a regular grid: the bearing and spacing; 20,000 collars without an O(n^2) slip", () => {
  const pts = [];
  // fences bearing 30 degrees, 40 m between collars along a fence, 200 m between fences
  const az = (30 * Math.PI) / 180, u = [Math.sin(az), Math.cos(az)], v = [Math.cos(az), -Math.sin(az)];
  for (let f = 0; f < 100; f++) for (let k = 0; k < 200; k++) pts.push({ x: 500000 + u[0] * k * 40 + v[0] * f * 200, y: 6700000 + u[1] * k * 40 + v[1] * f * 200 });
  drillLineGeometry(pts.slice(0, 2000)); // warm
  const t = performance.now();
  const g = drillLineGeometry(pts);
  const ms = performance.now() - t;
  assert.ok(Math.abs(g.azimuth - 30) <= 1, String(g.azimuth));
  assert.ok(Math.abs(g.spacing - 200) <= 10, String(g.spacing));
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms (about 0.13 s on the dev machine; the bound catches an O(n²) slip)`);
});

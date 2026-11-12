// TASKS.csv #2128 — the Maps plan's coordinate grid (round spacing, edge labels) and a two-click measure (distance, grid bearing,
// the true-north offset there)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planGridStep, planGridLines, gridLabel, measureLine, distanceText } from "../src/lib/planGrid.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#2128 grid spacing and lines", () => {
  assert.equal(planGridStep(10), 2000); // 1,200 m wanted -> 2 km
  assert.equal(planGridStep(8), 1000); // 960 m -> 1 km
  assert.equal(planGridStep(0.4), 50);
  assert.equal(planGridStep(0), null);
  const { xs, ys } = planGridLines({ left: 639500, top: 5832500, w: 400, h: 300, mPerPx: 10 }, 1000); // 4 x 3 km
  assert.deepEqual(xs, [640000, 641000, 642000, 643000]);
  assert.deepEqual(ys, [5830000, 5831000, 5832000]);
  assert.deepEqual(planGridLines({ left: 0, top: 0, w: 1000, h: 1000, mPerPx: 10 }, 1), { xs: [], ys: [] }); // too many lines: none
  assert.equal(gridLabel(640000, "E"), `${(640000).toLocaleString()} E`);
});

test("#2128 the measured line", () => {
  const m = measureLine({ x: 640000, y: 5830000 }, { x: 643000, y: 5833000 });
  assert.ok(Math.abs(m.distM - 4242.64) < 0.01);
  assert.ok(Math.abs(m.bearingDeg - 45) < 1e-9);
  assert.equal(measureLine({ x: 0, y: 0 }, { x: -100, y: 0 }).bearingDeg, 270);
  assert.equal(measureLine({ x: 0, y: 0 }, { x: 0, y: -100 }).bearingDeg, 180);
  assert.deepEqual([distanceText(3000), distanceText(12345), distanceText(250.4), distanceText(4.25)], ["3.00 km", "12.3 km", "250 m", "4.3 m"]);
});

test("#2128 the plan draws the grid and measures", () => {
  const m = read("components/MapsPlanView.jsx");
  assert.match(m, /if \(showGrid\) \{ \/\/ #2128/);
  assert.match(m, /setMPts\(\(q\) => \(q\.length >= 2 \? \[p\] : \[\.\.\.q, p\]\)\)/);
  assert.match(m, /Math\.hypot\(e\.clientX - d\.x, e\.clientY - d\.y\) > 4/); // a drag pans, it does not measure
  assert.match(m, /trueNorthBearingInGridDeg\(\(mPts\[0\]\.x \+ mPts\[1\]\.x\) \/ 2/);
  assert.match(m, /onDoubleClick=\{measuring \? undefined : fit/);
});

// TASKS.csv #1787 — the AMT resistivity survey (1 to 9,886 ohm·m) was drawn on a linear viridis ramp between 37.6 and 6,527: most points were
// the darkest colour. A positive point survey now has a Linear / Log colour scale, with a hint when it spans two decades or more.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decadesBetween, isLogSpaced, logViridisStops, VIRIDIS_HEX } from "../src/lib/pointSurveyScale.js";
import { colorForVoxelValue } from "../src/lib/layers.js";

test("decades and log-spaced stops", () => {
  assert.ok(Math.abs(decadesBetween(37.6, 6527) - 2.24) < 0.01);
  assert.equal(decadesBetween(0, 10), null);
  const s = logViridisStops(37.6, 6527);
  assert.equal(s.length, 17);
  assert.ok(Math.abs(s[0].value - 37.6) < 1e-9 && Math.abs(s[16].value - 6527) < 1e-6);
  assert.equal(isLogSpaced(s), true);
  assert.equal(s[0].color.toLowerCase(), VIRIDIS_HEX[0]);
  assert.equal(isLogSpaced([{ value: 1 }, { value: 2 }, { value: 3 }]), false);
  assert.equal(isLogSpaced([]), false);
});

test("on the log stops the geometric middle of the range gets the middle colour", () => {
  const stops = logViridisStops(10, 1000);
  const model = { min: 10, max: 1000, colorMode: "continuous", stops };
  const mid = colorForVoxelValue(model, 100), lin = colorForVoxelValue({ min: 10, max: 1000, colorMode: "continuous", stops: [] }, 100);
  assert.equal(mid, stops[8].color); // 100 is the 9th of 17 log-spaced stops
  assert.notEqual(mid, lin);
});

test("the point-survey card offers the choice and the hint", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /aria-label=\{tr\("Colour scale of the point survey"\)\}/);
  assert.match(src, /ptsLegendUpdate\("geophys_pts", e\.target\.value === "log" \? \{ stops: logViridisStops\(cur\.min, cur\.max\), colorMode: "continuous" \} : \{ stops: \[\] \}\)/);
  assert.match(src, /!isLog && dec >= 2 &&/);
  assert.match(src, /onUpdate=\{ptsLegendUpdate\}/);
});

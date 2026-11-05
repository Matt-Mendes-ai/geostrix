// TASKS.csv #1588 (review #1497, Lawyers) — Spatial analysis takes one survey at a time, names its units and colours on a
// 2-98 % stretch, instead of one tessellation over two mag surveys and a VLF survey with a unitless mean
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { robustRange, surveyKey } from "../src/lib/geophysSurveys.js";

test("the stretch and the survey key the panel uses", () => {
  const vals = [...Array.from({ length: 98 }, (_, i) => 56000 + i), 2105, 167300]; // two wild readings
  const r = robustRange(vals);
  assert.ok(r.min >= 56000 && r.max <= 56100, JSON.stringify(r)); // the wild ones do not set the ramp
  assert.equal(surveyKey({ _src: "20210619_WalkMAG.xyz" }), "20210619_WalkMAG.xyz");
});

test("the component filters to the chosen survey, offers the select for several, and puts the units on the stats", () => {
  const s = readFileSync(new URL("../src/components/SpatialAnalysis.jsx", import.meta.url), "utf8");
  assert.match(s, /export default function SpatialAnalysis\(\{ points, surveys = \[\], onClose \}\)/);
  assert.match(s, /points\.filter\(\(p\) => surveyKey\(p\) === key\)/);
  assert.match(s, /surveys\.length > 1 && \(/);
  assert.match(s, /aria-label=\{tr\("Survey to analyse"\)\}/);
  assert.match(s, /robustRange\(vals\)/);
  assert.match(s, /<StatRow label=\{tr\("Declustered mean"\)\} value=\{fmt\(stats\.declusteredMean\)\} highlight \/>/);
  assert.doesNotMatch(s, /cloudShape\(points\)/); // the shape of the chosen survey, not of everything
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /<SpatialAnalysis points=\{rows\} surveys=\{surveyList\.map\(\(s\) => \(\{ \.\.\.s, units: geophysSurveys\[s\.key\]\?\.units \|\| ""/);
});

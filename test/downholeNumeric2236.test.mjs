// TASKS.csv #2236 (review #2174, WA gold) — the Downhole plot showed structures against a Litho track only: RQD % and Recovery % of the
// same hole (263 intervals each) could not be drawn beside the tadpoles. A 'Numeric track' select now offers every numeric log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAYER_META } from "../src/lib/layers.js";

const src = readFileSync(new URL("../src/components/DownholeStructurePlot.jsx", import.meta.url), "utf8");

test("the numeric logs offered: built-in numeric interval / point layers and numeric custom layers", () => {
  const builtIn = Object.entries(LAYER_META).filter(([, m]) => m.numeric && (m.kind === "interval" || m.kind === "point")).map(([k]) => k);
  for (const k of ["geotech", "recovery", "sg", "magsusc"]) assert.ok(builtIn.includes(k), k);
  assert.match(src, /Object\.entries\(LAYER_META\)\.filter\(\(\[k, m\]\) => m\.numeric && \(m\.kind === "interval" \|\| m\.kind === "point"\) && \(storeLayers\[k\] \|\| \[\]\)\.length\)/);
  assert.match(src, /\(customLayers \|\| \[\]\)\.filter\(\(c\) => \(c\.rows \|\| \[\]\)\.length && isNumericLayer\(c\.rows\)\)/);
});

test("intervals as bars, points as a line, the track's own range, and room in the figure", () => {
  assert.match(src, /r\.from != null && r\.to != null \? \{ from: Number\(r\.from\), to: Number\(r\.to\), v: Number\(r\.value\) \} : \{ at: Number\(r\.depth\), v: Number\(r\.value\) \}/);
  assert.match(src, /\{numRows\.points\s*\? <polyline/);
  assert.match(src, /NUM_W = numSrc \? 76 : 0;/);
  assert.match(src, /\(numSrc \? GAP \+ NUM_W : 0\)/);
  assert.match(src, /aria-label=\{tr\("Numeric track"\)\}/);
});

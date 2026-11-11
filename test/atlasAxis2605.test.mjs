// TASKS.csv #2605 — Atlas strip logs gave every hole its own unlabelled log axis (a barren hole's bars as long as a 5.5 % hole's) and drew
// below-detection results as full bars. One axis per element over the atlas's holes; '<' results are hollow ticks; all-below is said.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStripLogSvgMarkup, assayTrackRange } from "../src/lib/striplogSvg.js";

const collars = [{ hole_id: "B", x: 0, y: 0, z: 100, azimuth: 0, dip: 90, length: 20 }, { hole_id: "R", x: 50, y: 0, z: 100, azimuth: 0, dip: 90, length: 20 }];
const assays = [
  { hole_id: "B", from: 0, to: 10, values: { Li2O: 0.011 } }, { hole_id: "B", from: 10, to: 20, values: { Li2O: 0.014 } },
  { hole_id: "R", from: 0, to: 10, values: { Li2O: 5.5 } }, { hole_id: "R", from: 10, to: 20, values: { Li2O: 0.017 } },
  { hole_id: "B", from: 0, to: 20, values: { Ta: 0.00041 }, qualifiers: { Ta: "<" } },
];
const eu = { Li2O: "%", Ta: "%" };
const barWidths = (svg) => [...svg.matchAll(/<rect x="[^"]+" y="[^"]+" width="([\d.]+)" height="[^"]+" fill="#c9863d"/g)].map((m) => Number(m[1]));

test("one axis for all pages: the barren hole's bars are short against the rich hole's range", () => {
  const range = assayTrackRange(assays, "Li2O", "%", eu);
  assert.deepEqual(range, { lo: 0.011, hi: 5.5 });
  const own = barWidths(buildStripLogSvgMarkup({ holeId: "B", collars, layers: {}, assays, assaySymbols: ["Li2O"], elementUnits: eu }).svg);
  const svg = buildStripLogSvgMarkup({ holeId: "B", collars, layers: {}, assays, assaySymbols: ["Li2O"], elementUnits: eu, assayRanges: { Li2O: range } }).svg;
  const w = barWidths(svg);
  assert.equal(Math.max(...own), 80, "on its own axis the barren hole's top bar is full width");
  assert.ok(Math.max(...w) < 10, String(w));
  assert.match(svg, /all pages/);
});

test("below detection is a hollow tick, and a track all below detection says so", () => {
  const svg = buildStripLogSvgMarkup({ holeId: "B", collars, layers: {}, assays, assaySymbols: ["Ta"], elementUnits: eu }).svg;
  assert.equal(barWidths(svg).length, 0, "no full bars");
  assert.match(svg, /all below detection/);
  assert.match(svg, /fill="none" stroke="#8a95a3"/);
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(m, /assayRanges: Object\.fromEntries\(syms\.map\(\(s\) => \[s, assayTrackRange\(rows,/);
});

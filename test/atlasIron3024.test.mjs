// TASKS.csv #3024 (review #2876, WA iron) — Atlas strip logs for an iron-ore hole: up to five assay tracks (Fe, SiO2, Al2O3, P, LOI), a linear
// axis with labelled ticks for an element spanning under two decades (Fe 14-59 % had 'log 14-58.9' and no ticks), and core recovery as a track
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayAxis, buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

test("assayAxis: Fe 14-58.9 % is linear 0-60 with ticks 0 / 20 / 40 / 60; Au 0.01-10 g/t stays log", () => {
  assert.deepEqual(assayAxis(14, 58.9), { linear: true, max: 60, ticks: [0, 20, 40, 60] });
  assert.equal(assayAxis(0.01, 10).linear, false);
  assert.equal(assayAxis(0.01, 0.03).linear, true);
  assert.equal(assayAxis(NaN, 5).linear, false);
});

const collars = [{ hole_id: "DD1", x: 0, y: 0, z: 440, azimuth: 0, dip: -90, length: 40 }, { hole_id: "RC1", x: 50, y: 0, z: 440, azimuth: 0, dip: -90, length: 40 }];
const layers = {
  litho: [{ hole_id: "DD1", from: 0, to: 40, value: "BIF" }, { hole_id: "RC1", from: 0, to: 40, value: "BIF" }],
  recovery: [{ hole_id: "DD1", from: 0, to: 20, value: 95 }, { hole_id: "DD1", from: 20, to: 40, value: 60 }],
};
const assays = [10, 20, 30].map((d, i) => ({ hole_id: "DD1", from: d, to: d + 2, values: { Fe: [14, 42, 58.9][i], Si: 10, Al: 2, P: 0.05, LOI: 4 } }));
const eu = { Fe: "%", Si: "% SiO2", Al: "% Al2O3", P: "%", LOI: "%" };

test("five assay tracks, Fe on a linear axis with its ticks, and a Rec.% track only on a hole that has recovery", () => {
  const dd = buildStripLogSvgMarkup({ holeId: "DD1", collars, layers, assays, assaySymbols: ["Fe", "Si", "Al", "P", "LOI"], elementUnits: eu }).svg;
  for (const s of ["Fe (%)", "Si (% SiO2)", "Al (% Al2O3)", "P (%)", "LOI (%)"]) assert.ok(dd.includes(`>${s}<`), s);
  assert.match(dd, />Rec\.%</);
  assert.match(dd, />20<\/text>[^]*>40<\/text>[^]*>60<\/text>/);
  const rc = buildStripLogSvgMarkup({ holeId: "RC1", collars, layers, assays, assaySymbols: ["Fe"], elementUnits: eu }).svg;
  assert.ok(!/>Rec\.%</.test(rc), "no recovery logged: no empty track");
});

test("wiring: the Atlas offers five assay track selects", () => {
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(m, /useState\(\["", "", "", "", ""\]\)/);
  assert.match(m, /\{\[0, 1, 2, 3, 4\]\.map\(\(k\) => \(\s*<select key=\{k\} value=\{assaySymbols\[k\]\}/);
});

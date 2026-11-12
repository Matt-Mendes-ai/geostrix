// TASKS.csv #2561 — the RTP / RTE box fills I and D from IGRF-14 for a survey date at the grid's centre and level, and records the source
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { igrfField, decimalYear } from "../src/lib/igrf.js";

test("#2561 IGRF-14 at the review's place and date", () => {
  // the review: 2026-11-09 at 33.873 S, 116.061 E, 267 m -> 59,419 nT, -67.70, -2.12 (Inversion's numbers)
  const f = igrfField(116.061, -33.873, 0.267, decimalYear("2026-11-09"));
  assert.ok(Math.abs(f.total - 59419) < 3 && Math.abs(f.inclination + 67.70) < 0.02 && Math.abs(f.declination + 2.12) < 0.02, JSON.stringify(f));
});

test("#2561 the filter box: date, button, source line, recorded source; typing clears the source", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(m, /aria-label=\{tr\("Survey date \(for IGRF\)"\)\}/);
  assert.match(m, /onClick=\{\(\) => fillIgrf\(r\)\}/);
  assert.match(m, /const g = r\.grid, cx = g\.x0 \+ \(g\.dx \* \(g\.nx - 1\)\) \/ 2, cy = g\.yTop - \(g\.dy \* \(g\.ny - 1\)\) \/ 2;/);
  assert.match(m, /zM = rasterLevelM\(r\) \?\? \(Number\(r\.elevation\) \|\| 0\)/);
  assert.match(m, /fieldSource: filt\.igrfSource \|\| "typed by the user"/);
  assert.match(m, /inclination: e\.target\.value, igrfSource: null/);
  assert.match(m, /if \(project\?\.crsSet === false && !tieOf\(project\)\)/);
});

// TASKS.csv #2670 (#1731) — score maps get a 3D legend entry with their ramp and display range.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreRasterLegendGroups, SCORE_RAMP, isScoreRaster } from "../src/lib/viewer/scoreRasterLegend.js";
import { scoreImage, isOverlayOutput } from "../src/lib/evidence.js";

test("the copies match evidence.js: the ramp scoreImage paints and the score-raster test", () => {
  const img = scoreImage(Float32Array.from([0, 0.25, 0.5, 0.75, 1]), 5, 1, 1);
  SCORE_RAMP.forEach((c, i) => assert.deepEqual([img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]], c, `stop ${i}`));
  for (const tool of ["fuzzy overlay", "weights of evidence (posterior probability)", "weights of evidence (posterior standard deviation)", "kriging", "", undefined]) {
    assert.equal(isScoreRaster({ params: { tool } }), isOverlayOutput({ params: { tool } }), String(tool));
  }
});

test("a posterior stretched to 0.946: a ramp from 0 to 0.946, pale to dark red; other rasters, hidden ones and bad ranges are skipped", () => {
  const g = scoreRasterLegendGroups([
    { id: "p", name: "Plan-view weights-of-evidence posterior", params: { tool: "weights of evidence (posterior probability)", displayRange: [0, 0.946] } },
    { id: "f", name: "Fuzzy", visible: false, params: { tool: "fuzzy overlay", displayRange: [0, 1] } },
    { id: "m", name: "Mag", params: { tool: "gridding" } },
    { id: "s", name: "Styled", colourStops: [{}, {}], colourRange: [0, 1], params: { tool: "fuzzy overlay", displayRange: [0, 1] } },
    { id: "z", name: "Flat", params: { tool: "fuzzy overlay", displayRange: [0, 0] } },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].label, "Plan-view weights-of-evidence posterior");
  assert.equal(g[0].ramp.min, 0); assert.equal(g[0].ramp.max, 0.946);
  assert.equal(g[0].ramp.colors[0], "#ffffcc"); assert.equal(g[0].ramp.colors[g[0].ramp.colors.length - 1], "#800026");
  assert.equal(scoreRasterLegendGroups([{ id: "o", name: "Old", params: { tool: "fuzzy overlay" } }])[0].ramp.max, 1, "no displayRange: 0-1, as scoreImage's default");
});

test("the 3D legend includes them", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\.\.\.rasterLegendGroups\(rasters\), \.\.\.scoreRasterLegendGroups\(rasters\)/);
});

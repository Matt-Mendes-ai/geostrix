// TASKS.csv #1423 — grade-tool texts that no longer matched the tools: kriging missing from the header, 'no classification' beside
// a support classification, 'inverse-distance' for a six-method shell, an 'unresponsive' window that stays responsive, 'a exponential',
// 'those..', NN's always-true dominated-weight note, and a search-radius wall when there was no radius
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel as estimateBlocks } from "../src/lib/estimation.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the texts say what the tools do now", () => {
  const g = src("../src/components/GradeEstimationModal.jsx");
  assert.match(g, /moving-least-squares or ordinary-kriging interpolation from composited assays/);
  assert.match(g, /no declustering and no resource classification\./);
  assert.match(g, /no declustering, no variogram, and no resource classification\./);
  assert.match(g, /Kriged with the \{model\} variogram/); // #2429: 'the fitted ... fitted to' said it twice
  assert.ok(!/Kriged with a \{model\}/.test(g));
  const m = src("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(m, /interpolation onto a grid \(by the method chosen below\)/);
  assert.match(m, /its progress and Cancel are in the status bar/);
  assert.ok(!/window will be unresponsive/.test(m) && !/window will be unresponsive/.test(src("../src/help/pages/modelling.js")));
  const r = src("../src/modules/viewer/modellingRuns.js");
  assert.match(r, /notice\(!\(numericSearchRadius > 0\) \? "\\"\{label\}\\" was closed ARTIFICIALLY at the edge of the grid/);
  assert.match(r, /summarizeSupport\(grid\.supportCounts, \{ tool: "shell" \} \/\* #2071 \*\/\)\.replace\(\/\\.\$\/, ""\)/); // #2071: the shells own advice
});

test("nearest neighbour never reports blocks 'dominated' by one hole", () => {
  const pts = [];
  for (const [hx, n] of [[0, 6], [30, 6]]) for (let i = 0; i < n; i++) pts.push({ x: hx, y: 0, z: -i * 5, value: 1 + hx / 30, hole_id: `H${hx}`, length: 1 });
  const opts = { bounds: { xmin: -10, xmax: 40, ymin: -10, ymax: 10, zmin: -30, zmax: 0 }, cellSize: { dx: 5, dy: 5, dz: 5 }, searchRadius: 60, minHoles: 2, maxSamples: 8 };
  const nn = estimateBlocks(pts, { ...opts, method: "nn" });
  assert.equal(nn.dominatedCells, 0);
  const idw = estimateBlocks(pts, { ...opts, method: "idw3" });
  assert.ok(idw.dominatedCells > 0, String(idw.dominatedCells)); // other methods still count them (144 of 240 here; NN was 240 of 240 before)
});

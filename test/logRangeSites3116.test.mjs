// TASKS.csv #3116 — the other readers of a log pass the project's built-in log ranges / despike (project.logValidRange) to
// numericSourceChoices / findNumericSource, so Estimation, Grade shell (the pane and its run), the unsampled-metres log choice,
// Statistics and the Geochem X-Y read the same filtered readings as Downhole logs, and their source labels say so.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("each reader passes the project's log ranges", () => {
  const est = read("components/GradeEstimationModal.jsx");
  assert.equal((est.match(/models: false(?: \/\* #2397 — not a model of a model \*\/)?, logValidRange: project\?\.logValidRange/g) || []).length, 2, "Estimation: the kept source check and the list");
  assert.match(read("components/UnsampledChoice.jsx"), /\{ layers, customLayers, logValidRange \} : null\), \[layers, customLayers, logValidRange\]\)/);
  assert.match(read("components/GradeStatistics.jsx"), /logValidRange: storeProject\?\.logValidRange \/\* #3116 \*\//);
  assert.match(read("modules/GeochemModule.jsx"), /logValidRange: store\.project\?\.logValidRange \/\* #3116 \*\//);
  const mp = read("modules/viewer/ModellingPanes.jsx");
  assert.match(mp, /numericSourceChoices\(\{ layers, customLayers: customLayersAll, logValidRange: storeProject\?\.logValidRange/);
  assert.match(mp, /const ns = findNumericSource\(next, \{ layers, customLayers: customLayersAll, logValidRange: storeProject\?\.logValidRange \}\)/, "the proposed cutoff from the filtered readings");
});

test("the grade shell run: useModelling adds the ranges to the run's context, the run reads its source with them", () => {
  assert.match(read("modules/viewer/useModelling.js"), /ctxRef\.current = \{ \.\.\.ctx, logValidRange \};/);
  const runs = read("modules/viewer/modellingRuns.js");
  assert.match(runs, /findNumericSource\(numericSymbol, \{ layers, customLayers, logValidRange \}\)/);
  assert.match(runs, /logCtx: \{ layers, customLayers, logValidRange \} \}\)/);
});

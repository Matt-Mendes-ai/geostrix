// TASKS.csv #1418 — a kriging-variance model's card said 'CSV', and its 'Added' notice and the grade-shell data-support summary
// showed red as errors because their text holds 'error' (the model's name) / 'unsupported' (the counts)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notice, noticeLevel } from "../src/lib/notices.js";

test("the wording rule alone would have called these errors; an explicit level wins", () => {
  const added = notice("Added block model \"{name}\" ({cells} cells).", { name: "Zn estimate — kriging variance (data layout, not a grade error)", cells: "47,480" });
  assert.equal(noticeLevel(added), "error"); // what the reviewer saw
  assert.equal(noticeLevel({ ...added, level: "info" }), "info");
});

test("the card names kriging variance and geoML; both notices pass an info level", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /model\.source === "kriging-variance" \? tr\("Kriging variance"\) : model\.source === "geoml" \? "geoML" : "CSV"/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{ \.\.\.notice\("Added block model \\"\{name\}\\" \(\{cells\} cells\)\.", \{[^}]*\}\), level: "info"/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /\{ \.\.\.notice\("\\"\{label\}\\" data support[\s\S]*?v2: summarizeSupport\(surfCounts, \{ tool: "shell" \}\)[^}]*\}\), level: "info"/); // #2071: the shells own advice // #1423 strips the summary's full stop
});

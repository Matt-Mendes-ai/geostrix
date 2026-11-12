// TASKS.csv #2749 (split from #2384; DECISION 2026-11-12, Matt: no new button, no one-click flatten, since it would also change the 'implicit'
// trend slot the GemPy implicit / stack runs read) — the seam notice of a closed body names the exact steps to a trend along the layer:
// Model settings › Structural trends › New trend › 'Set the plane from…' › 'Tops of a logged unit', and the 'Used by' slot it must be chosen in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
const trends = readFileSync(new URL("../src/components/TrendsPanel.jsx", import.meta.url), "utf8");
const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");

test("the seam notice names the steps, in order, and says the GemPy runs follow the same slot", () => {
  assert.ok(runs.includes("Between holes the search is still a sphere. To flatten it along the layer: Model settings › Structural trends › New trend; in 'Set the plane from…' pick 'Tops of a logged unit (best-fit plane)' › {code}; then under 'Used by' choose that trend for 'Geology models (implicit surfaces, stacks)' (the GemPy implicit and stack runs follow it too)."));
  assert.doesNotMatch(runs, /a geology trend in Model settings flattens it along the layer/);
});

test("every label the notice names is a label the panes show (a rename would strand the steps)", () => {
  for (const [label, src] of [["Model settings", panes + runs], ["Structural trends", panes], ["New trend", trends], ["Set the plane from…", trends], ["Tops of a logged unit (best-fit plane)", trends], ["Used by", trends], ["Geology models (implicit surfaces, stacks)", trends]]) {
    assert.ok(src.includes(`"${label}"`), label);
  }
  assert.match(runs, /trendWarp\(isCode \? "implicit" : "alteration"\)/, "a closed body of a code reads the 'implicit' (Geology models) slot");
});

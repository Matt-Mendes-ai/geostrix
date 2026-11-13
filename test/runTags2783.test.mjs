// TASKS.csv #2783 (split from #2551) — a generated surface's 'Parameters used' line and a block model's tooltip name what bounded the run: the
// trend, the restricting solid, the code domain and the holes it drew on.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runTags, shellTagText, modelTip } from "../src/lib/viewer/runTags.js";

const shell = { tool: "numeric grade shell", element: "Li", anisotropy: { trend: "Trend 1" }, domain: "Pegmatite solid", modelArea: "holes checked in the Holes list (18 of 40)" };
const estimate = { tool: "Grade estimation", element: "Li", searchTrend: { name: "Trend 1" }, domain: "Lithology", samplesFrom: "holes checked in the Holes list (18 of 40)", gridFrom: "box of the restricting solid \"Pegmatite solid\" within the drilling" };

test("a grade shell's and a block estimate's records read the same way", () => {
  assert.deepEqual(runTags(shell), { trend: "Trend 1", solid: "Pegmatite solid", domain: null, area: "holes checked in the Holes list (18 of 40)" });
  assert.deepEqual(runTags(estimate), { trend: "Trend 1", solid: "Pegmatite solid", domain: "Lithology", area: "holes checked in the Holes list (18 of 40)" });
  assert.deepEqual(runTags({ tool: "numeric grade shell", anisotropy: null, domain: null, modelArea: "whole property" }), { trend: null, solid: null, domain: null, area: null });
  assert.deepEqual(runTags({ tool: "Grade estimation", samplesFrom: "every hole", gridFrom: "the drilling's box" }), { trend: null, solid: null, domain: null, area: null });
  assert.deepEqual(runTags(null), { trend: null, solid: null, domain: null, area: null });
});

test("the shell line gains the solid and the area; the tooltip a line for each bound", () => {
  assert.equal(shellTagText(shell), " · inside \"Pegmatite solid\" · holes checked in the Holes list (18 of 40)");
  assert.equal(shellTagText({ tool: "numeric grade shell", modelArea: "whole property" }), "");
  assert.equal(modelTip("Li estimate (OK)", estimate), "Li estimate (OK)\nTrend: Trend 1\nInside the solid \"Pegmatite solid\"\nDomain: Lithology\nSamples from: holes checked in the Holes list (18 of 40)");
  assert.equal(modelTip("Imported model", undefined), "Imported model");
});

test("wiring: the shell's line and the block-model row use them", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{\/\* #2423 \*\/\}\{shellTagText\(s\.params\) \/\* #2783 \*\/\}<\/>/);
  assert.match(v, /<span title=\{modelTip\(v\.name, v\.params\)/);
});

// TASKS.csv #2909 (WA iron review) — the X-Y statistics line read every sample ('n 147,659 · Spearman -0.96') while the lithology filter
// showed 26,253: it is now computed over the rows the plot draws
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");

test("xyStat is computed from the plotted (filtered) rows, after them", () => {
  const iPlotted = g.indexOf("const plotted = useMemo(() => "); // #3120: its body is wrapped in keptMemo
  const iStat = g.indexOf("const xyStat = useMemo(");
  assert.ok(iPlotted > 0 && iStat > iPlotted, "declared after plotted (it reads it)");
  const line = g.slice(iStat, g.indexOf("\n", iStat));
  assert.match(line, /xyStats\(xyAxes\[0\], xyAxes\[1\], plotted, elementUnits,/); assert.match(line, /keptMemo\(\[plotted, /); // #3120: kept by the plotted rows
  assert.match(line, /\[xyAxes, plotted, /);
  assert.ok(!line.includes("sourceRows"));
});

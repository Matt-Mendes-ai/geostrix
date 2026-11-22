// TASKS.csv #1554 — the Last model box said 'stack V-Ash Tuff' for one unit and 'stack Vn1a' for a vein, and offered unit volumes,
// a block model and a 'modelled unit' layer after a structure run
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("'stack' only for several units, and no unit actions after a structure run", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /title: `\$\{unitSpecs\.length > 1 \? `stack \$\{unitSpecs\.map\(\(sp\) => sp\.meshName\)\.join\(" over "\)\}` : unitSpecs\[0\]\?\.label \|\| unitSpecs\[0\]\?\.meshName \|\| ""\}/);
  assert.match(r, /structural: trendTool === "structural"/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  // #3988 - the three Add buttons are in the Result block (ModelResultBlock.jsx), not for a structural model; ViewerModule wires the same three actions
  const rb = readFileSync(new URL("../src/components/ModelResultBlock.jsx", import.meta.url), "utf8");
  assert.ok(rb.includes("last?.structural ? null : (<>"));
  for (const [prop, fn] of [["onUnitVolumes", "addUnitVolumes"], ["onBlockModel", "addLithBlockModel"], ["onModelledLayer", "addModelledLayer"]]) assert.ok(v.includes(`${prop}={${fn}}`), fn);
});

// TASKS.csv #1593 — the 3D View's palette link opens that block model's legend editor in Geophysics > Block models.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the request names the model; its card opens its legend (now, or when it mounts after the pane switch)", () => {
  const g = fs.readFileSync("src/modules/GeophysicsModule.jsx", "utf8");
  assert.match(g, /pendingLegend = \{ id: String\(p\.id\), at: Date\.now\(\) \}; window\.dispatchEvent\(new CustomEvent\(OPEN_LEGEND_EVENT/);
  assert.match(g, /useOpenLegendRequest\(model, \(\) => setLegendOpen\(true\)\);/);
  assert.match(fs.readFileSync("src/modules/ViewerModule.jsx", "utf8"), /requestModuleAction\("edit-block-model", \{ id: v\.id \}\)/);
});

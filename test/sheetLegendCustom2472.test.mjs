// TASKS.csv #2472 — a sheet's legend never listed custom layers (a stratigraphic unit, a gamma log) though the 3D legend did: Layout's
// legendFromView had no custom-layer builder. It now takes the 3D view's own one, narrowed to the frame's holes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customLegendGroups } from "../src/lib/customColour.js";

test("the builder gives a group for a categorical custom layer, and none when the layer is hidden", () => {
  const L = [{ id: "s", name: "Strat unit", rows: [{ hole_id: "A", from: 0, to: 5, value: "E1" }, { hole_id: "A", from: 5, to: 9, value: "E2" }] }];
  const g = customLegendGroups(L, {}, {});
  assert.equal(g.length, 1); assert.match(g[0].label, /Strat unit/);
  assert.ok(g[0].items.length >= 2);
  assert.equal(customLegendGroups(L, { s: false }, {}).length, 0);
});

test("Layout's legend from the view includes them", () => {
  const p = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(p, /\.\.\.customLegendGroups\(frameHoles \? customLayers\.map\(\(l\) => \(\{ \.\.\.l, rows: inFrame\(l\.rows\) \}\)\) : customLayers, theme\.customVisible/);
});

// TASKS.csv #1823 — the Surface Geology sidebar lists the block models and rasters drawn over the map, with a show / hide tick
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the list sets the same visible flag as the 3D View and sits under Map layers", () => {
  const c = readFileSync(new URL("../src/components/CoveringLayers.jsx", import.meta.url), "utf8");
  assert.ok(c.includes("updateVoxelModel(v.id, { visible: on })"));
  assert.ok(c.includes("updateRaster(r.id, { visible: on })"));
  assert.ok(c.includes("if (!items.length) return null;"), "nothing shown when nothing covers the map");
  const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  const i = s.indexOf("<CoveringLayers />"), j = s.indexOf('{part !== "maps" && (<>');
  assert.ok(i > 0 && i < j, "inside the maps part, before the structures part");
});

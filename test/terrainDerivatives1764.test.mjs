// TASKS.csv #1764 — five terrain derivatives made one after another were all visible drapes on the same terrain, and the 3D View showed
// the aspect, not the curvature just made. A new derivative now hides the earlier visible ones of the same terrain, and says so.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { earlierDerivatives } from "../src/lib/hillshade.js";

const terrain = { id: "t1", name: "Copley DEM" };
const d = (id, kind, extra = {}) => ({ id, name: `${kind}_Copley DEM`, terrainDerivative: { kind, terrainId: "t1", terrainName: "Copley DEM" }, ...extra });

test("the visible derivatives of this terrain, and only those", () => {
  const rasters = [d("a", "hillshade"), d("b", "slope", { visible: false }), d("c", "aspect"), { id: "m", name: "mag.tif" },
    { id: "o", name: "slope_other", terrainDerivative: { kind: "slope", terrainId: "t2", terrainName: "Other DEM" } }];
  assert.deepEqual(earlierDerivatives(rasters, terrain).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(earlierDerivatives(rasters, null), []);
  // a terrain with no id (older projects): matched on the name
  assert.deepEqual(earlierDerivatives([{ id: "x", terrainDerivative: { kind: "slope", terrainId: null, terrainName: "DEM" } }], { name: "DEM" }).map((r) => r.id), ["x"]);
});

test("Generate hides them and says which", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const earlier = earlierDerivatives\(rasters, terrain\);[^\n]*\r?\n\s*earlier\.forEach\(\(x\) => updateRaster\(x\.id, \{ visible: false \}\)\);/);
  assert.match(src, /if \(hid\) setTerrainError\(\(prev\) =>/);
});

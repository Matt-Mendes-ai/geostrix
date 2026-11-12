// TASKS.csv #2706 — the Evidence overlay gives its last result back when it reopens on the same cards, grid and data
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");

test("the result is kept at module level with its recipe, grid signature and data, and given back only when all match", () => {
  assert.match(p, /^let keptResult = null;$/m);
  assert.match(p, /keptResult = \{ result, recipe: JSON\.stringify\(recipe\), sig: gridSignature\(grid\), deps: dataDeps \};/);
  assert.match(p, /if \(k\.sig === gridSignature\(grid\) && k\.recipe === JSON\.stringify\(recipe\) && k\.deps\.length === dataDeps\.length && k\.deps\.every\(\(d, i\) => d === dataDeps\[i\]\)\) \{ resultBack\.current = true; setResult\(k\.result\); \}/);
  // once, after the saved cards are restored, and never over a result already there
  assert.match(p, /if \(resultBack\.current \|\| result \|\| !keptResult \|\| !grid \|\| !layers\.length\) return;/);
  for (const d of ["rasters", "mapLayers", "surfaceSamples", "assays", "collars", "survey", "voxelModels", "projectLayers", "customLayers"]) assert.ok(new RegExp(`const dataDeps = \\[[^\\]]*\\b${d}\\b`).test(p), d);
});

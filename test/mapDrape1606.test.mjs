// TASKS.csv #1606 — a map layer imported before any terrain drapes on one built later (it is 'terrain', drawn flat meanwhile).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("both import paths store 'terrain' (or 'file' for 3D points / lines with no terrain)", () => {
  const s = fs.readFileSync("src/components/SurfaceMappingPanel.jsx", "utf8");
  assert.match(s, /addMapLayer\(\{ \.\.\.layer, drapeMode: !terrain && layer\.hasZ && layer\.geomType !== "polygon" \? "file" : "terrain" \}\);/);
  assert.match(fs.readFileSync("src/modules/viewer/useImportPipeline.js", "utf8"), /live\.addMapLayer\(\{ \.\.\.layer, drapeMode: "terrain" \}\);/);
});

test("the renderer draws a 'terrain' layer flat until a terrain exists, then on it", () => {
  const s = fs.readFileSync("src/lib/viewer/sceneBuilders.js", "utf8");
  assert.match(s, /const drapeOnTerrain = l\.drapeMode === "terrain" && !!terrain;/);
  assert.match(s, /drapeOnTerrain \? `terrain:\$\{terrain\.id\}` : `flat:\$\{l\.elevation \|\| 0\}`/);
});

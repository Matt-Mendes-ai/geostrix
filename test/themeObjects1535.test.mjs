// TASKS.csv #1535 — a theme keeps raster, block-model and map-layer visibility (and opacity)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { objectVisibilityBundle, applyObjectVisibility } from "../src/lib/viewer/themeObjects.js";

const state = () => ({
  rasters: [{ id: "r1", name: "MAG RTP", visible: false, opacity: 0.6 }, { id: "r2", name: "VLF", visible: true, opacity: 0.85 }],
  voxelModels: [{ id: "v1", name: "MVI", visible: false }],
  mapLayers: [{ id: "m1", name: "Geology", visible: true, opacity: 0.5 }],
});

test("the bundle records each object's visibility, opacity and name", () => {
  const b = objectVisibilityBundle(state());
  assert.deepEqual(b.rasterVisible, { r1: { visible: false, opacity: 0.6 }, r2: { visible: true, opacity: 0.85 } });
  assert.deepEqual(b.voxelVisible, { v1: { visible: false } });
  assert.equal(b.objectNames.v1, "MVI");
});

test("applying puts back only what differs, leaves objects the theme never knew, and names the missing", () => {
  const theme = { name: "Lean Au view", ...objectVisibilityBundle(state()) };
  const now = state();
  now.rasters[0].visible = true; now.rasters[0].opacity = 0.9; // the RTP raster shown again
  now.voxelModels[0].visible = true;
  now.rasters.push({ id: "r3", name: "new raster", visible: true });
  now.mapLayers = []; // the geology layer was deleted
  const calls = [];
  const rec = (kind) => (id, patch) => calls.push([kind, id, patch]);
  const missing = applyObjectVisibility(theme, { ...now, updateRaster: rec("r"), updateVoxelModel: rec("v"), updateMapLayer: rec("m") });
  assert.deepEqual(calls, [["r", "r1", { visible: false, opacity: 0.6 }], ["v", "v1", { visible: false }]]);
  assert.deepEqual(missing, ["Geology"]);
});

test("a theme saved before #1535 changes nothing", () => {
  const calls = [];
  assert.deepEqual(applyObjectVisibility({ name: "old" }, { ...state(), updateRaster: () => calls.push(1) }), []);
  assert.equal(calls.length, 0);
});

test("wired: saved with the theme, in the live-view restore, and applied", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal((v.match(/\.\.\.objectVisibilityBundle\(themeObjRef\.current\)/g) || []).length, 2);
  assert.match(v, /const missingObj = applyObjectVisibility\(theme, themeObjRef\.current\);/);
  assert.match(v, /themeObjRef\.current = \{ rasters, voxelModels, mapLayers, updateRaster, updateVoxelModel, updateMapLayer \};/);
});

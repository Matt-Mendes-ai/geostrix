// TASKS.csv #1417 — a 3D View block-model row's palette link opens that model's card in Geophysics > Block models;
// full names on hover; the card's sliders no longer push the value off the card
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const geo = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("the row's link and its menu item ask for that model's card", () => {
  assert.equal(vm.split('requestModuleAction("edit-block-model", { id: v.id })').length - 1, 2);
  assert.match(vm, /<span title=\{v\.name\}/);
});

test("Geophysics opens Block models and scrolls to the visible card of that id", () => {
  assert.match(geo, /useModuleAction\(\["edit-block-model"\], \(_a, p\) => \{\s*setGeoPane\("voxel"\);/);
  assert.match(geo, /data-voxel-id=\{model\.id\}/);
  assert.match(geo, /\.find\(\(e\) => e\.offsetParent\)/);
});

test("the cutoff and opacity sliders can shrink", () => {
  // TASKS.csv #1780 — the card's cutoff is now the Min / Max range row (ViewerParts VoxelRangeRow); its sliders shrink the same way
  assert.match(readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8"), /fromSlider\(Number\(e\.target\.value\)\), dispMax\)\)\} style=\{\{ flex: 1, minWidth: 0 \}\}/);
  assert.match(geo, /onOpacityInput\(Number\(e\.target\.value\)\)\} style=\{\{ flex: 1, minWidth: 0 \}\}/);
});

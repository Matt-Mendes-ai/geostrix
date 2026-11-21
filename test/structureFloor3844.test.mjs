// TASKS.csv #3844 — the outcrop strike symbols keep a readable size zoomed out: the floor is a shader uniform per set (no per-symbol work per frame).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { setStructureFloor } from "../src/lib/viewer/sceneBuilders.js";
import { STRUCTURE_MIN_PX } from "../src/lib/viewer/symbolScale.js";

test("one factor per set: floor px x metres a pixel over the set's size; set only when it changes", () => {
  const group = new THREE.Group();
  for (const size of [25, 100]) { const g = new THREE.Group(); g.userData.floor = { u: { value: 0 }, size }; group.add(g); }
  group.add(new THREE.Group()); // a group without a floor is skipped
  setStructureFloor(group, 10);
  assert.equal(group.children[0].userData.floor.u.value, (STRUCTURE_MIN_PX * 10) / 25);
  assert.equal(group.children[1].userData.floor.u.value, (STRUCTURE_MIN_PX * 10) / 100);
  setStructureFloor(group, NaN); // a view with no size yet: unchanged
  assert.equal(group.children[0].userData.floor.u.value, (STRUCTURE_MIN_PX * 10) / 25);
  setStructureFloor(null, 1);
});

test("zoomed in (a symbol already bigger than the floor) the factor is under 1 and the shader's max(1, uK) leaves it alone", () => {
  const src = fs.readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /transformed = aCentre \+ \(transformed - aCentre\) \* max\(1\.0, uK\);/);
  assert.match(src, /lg\.setAttribute\("aCentre"/);
  assert.match(src, /tg\.setAttribute\("aCentre"/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /setStructureFloor\(surfStructGroupRef\.current, metresPerPixel\(camera, camState\.current\?\.radius, mount\.clientHeight\)\)/);
  assert.match(v, /mpp: metresPerPixel\(cameraRef\.current, camState\.current\?\.radius, mountRef\.current\?\.clientHeight\) \}\); drawSymbolsOnTop/);
});

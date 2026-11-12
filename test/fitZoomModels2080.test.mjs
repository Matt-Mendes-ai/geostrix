// TASKS.csv #2080 / #2092 (review #2013, Woodjam) — block models and rasters had 'Zoom to' only in their right-click menus, and Fit framed
// the holes on every tab, so on the Surface Geology tab the soils, grids and IP lines 10 km away were off-screen after Fit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { visibleSceneBox } from "../src/lib/viewer/fitAll.js";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("#2092 Fit on the Surface Geology tab frames everything shown; the holes-only zoom stays as it was elsewhere", () => {
  assert.match(v, /const fitButton = \(\) => \(mode === "surface" \? zoomToFitAll\(\) : zoomToHoles\(\)\);/);
  assert.match(v, /<button onClick=\{fitButton\} style=\{miniBtn\} title=\{mode === "surface" \? tr\("Zoom to fit all"\)/);
  // the right-click 'Zoom to the holes' still frames the holes only
  assert.equal((v.match(/label=\{tr\("Zoom to the holes"\)\} onClick=\{\(\) => \{ zoomToHoles\(\);/g) || []).length, 2);
});

test("#2092 the box Fit uses on that tab reaches shown data 10 km from the holes and skips hidden layers", () => {
  const root = new THREE.Group();
  const holes = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100)); root.add(holes);
  const soils = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10)); soils.position.set(10000, 0, 10000); root.add(soils);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10)); hidden.position.set(-50000, 0, 0); hidden.visible = false; root.add(hidden);
  const b = visibleSceneBox(root);
  assert.ok(b.max.x >= 10000 && b.max.z >= 10000);
  assert.ok(b.min.x > -1000, "a hidden layer does not count");
});

test("#2080 block-model and raster rows have a visible Zoom to", () => {
  assert.match(v, /iconAction\(\(\) => zoomToObject\(voxelMeshesRef\.current\[v\.id\]\), tr\("Zoom to \\"\{name\}\\"", \{ name: v\.name \}\)\)/);
  assert.match(v, /iconAction\(\(\) => zoomToObject\(rasterMeshesRef\.current\[r\.id\]\), tr\("Zoom to \\"\{name\}\\"", \{ name: r\.name \}\)\)/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Zoom to \"{name}\""], l);
});

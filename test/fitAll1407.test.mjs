// TASKS.csv #1407 — 'Zoom to fit all' framed the holes only (= Fit); now it frames everything shown under the scene's data root
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { visibleSceneBox } from "../src/lib/viewer/fitAll.js";

const pts = (arr) => new THREE.Points(new THREE.BufferGeometry().setFromPoints(arr.map(([x, y, z]) => new THREE.Vector3(x, y, z))));

test("shown groups count, hidden ones, labels and the measuring marks do not", () => {
  const root = new THREE.Group(); root.name = "root";
  const holes = new THREE.Group(); holes.name = "lithology"; holes.add(pts([[0, 0, 0], [100, -500, 100]]));
  const samples = new THREE.Group(); samples.name = "surface_samples"; samples.add(pts([[-20000, 10, 5000], [1000, 20, -28000]]));
  const hidden = new THREE.Group(); hidden.name = "mapLayers"; hidden.visible = false; hidden.add(pts([[90000, 0, 0]]));
  const labels = new THREE.Group(); labels.name = "sample_labels"; labels.add(pts([[0, 9000, 0]]));
  const sprite = new THREE.Sprite(); sprite.position.set(0, -9000, 0); holes.add(sprite);
  const moved = new THREE.Group(); moved.name = "rasters"; moved.position.set(0, 0, 40000); moved.add(pts([[0, 0, 0]]));
  root.add(holes, samples, hidden, labels, moved);
  const b = visibleSceneBox(root);
  assert.deepEqual(b.min.toArray(), [-20000, -500, -28000]);
  assert.deepEqual(b.max.toArray(), [1000, 20, 40000]); // the moved group's world position counts
});

test("an instanced mesh counts every instance; nothing shown is an empty box", () => {
  const root = new THREE.Group();
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial(), 2);
  m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-100, 0, 0)); m.setMatrixAt(1, new THREE.Matrix4().makeTranslation(300, 0, 0));
  root.add(m);
  const b = visibleSceneBox(root);
  assert.equal(b.min.x, -101); assert.equal(b.max.x, 301);
  assert.ok(visibleSceneBox(new THREE.Group()).isEmpty());
  assert.ok(visibleSceneBox(null).isEmpty());
});

test("the view's Zoom to fit all uses it, with the hole traces and models as before", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(s, /const zoomToFitAll = \(\) => \{ const b = visibleSceneBox\(sceneRef\.current\?\.getObjectByName\("root"\)\); \(lastTracesRef\.current \|\| \[\]\)\.forEach/);
  assert.match(s, /to include everything shown: right-click the view, Zoom to fit all/);
});

// TASKS.csv #3155 (side 5's follow-up) — the modelled-surface shaders are compiled at idle against the view's own scene and camera, so the
// first surface of a kind does not pay the compile in its landing (~35 ms).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { warmSurfacePrograms, surfaceWarmupMaterials } from "../src/lib/viewer/surfaceWarmup.js";

test("both surface materials compiled within the real scene, then taken out; the materials kept (their programs stay)", () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.AmbientLight(), new THREE.DirectionalLight());
  const seen = [];
  const renderer = { compile: (s, c) => { assert.equal(c, camera); s.traverse((o) => { if (o.isMesh) seen.push(o.material); }); } };
  assert.equal(warmSurfacePrograms(renderer, scene, camera), 2);
  const [plain, coloured] = surfaceWarmupMaterials();
  assert.deepEqual(seen, [plain, coloured]);
  assert.ok(plain.isMeshLambertMaterial && plain.side === THREE.DoubleSide && plain.transparent && !plain.vertexColors);
  assert.ok(coloured.vertexColors && coloured.side === THREE.DoubleSide && coloured.transparent);
  assert.equal(scene.children.length, 2, "the warm-up group is gone; the lights stay");
  assert.equal(surfaceWarmupMaterials()[0], plain, "the same materials each time");
});

test("no renderer, or a compile that throws: nothing done, the scene as it was", () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  assert.equal(warmSurfacePrograms(null, scene, camera), 0);
  assert.equal(warmSurfacePrograms({ compile: () => { throw new Error("lost context"); } }, scene, camera), 0);
  assert.equal(scene.children.length, 0);
});

test("the view schedules it at idle, out of the startup bundle, and cancels it on unmount; it matches what the runs land", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /requestIdleCallback\(\(\) => import\("\.\.\/lib\/viewer\/surfaceWarmup\.js"\)\.then\(\(m\) => \{ if \(rendererRef\.current === renderer\) m\.warmSurfacePrograms\(renderer, scene, camera\); \}\)/);
  assert.match(v, /if \(warmId != null\) cancelIdleCallback\(warmId\); \/\/ #3155/);
  assert.doesNotMatch(v, /^import .*surfaceWarmup/m);
  const runs = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(runs, /new THREE\.MeshLambertMaterial\(\{ color: spec\.color, side: THREE\.DoubleSide, transparent: true, opacity: 0\.75 \}\)/);
  assert.match(runs, /new THREE\.MeshLambertMaterial\(\{ color: 0xffffff, vertexColors: true, side: THREE\.DoubleSide, transparent: true, opacity: 0\.9 \}\)/);
});

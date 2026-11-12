// TASKS.csv #2623 (review #2325, WA uranium) — vertical exaggeration of the 3D view through the camera's view matrix, picks mapped back,
// collar markers round and with a pixel floor in their vertex shader
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { setVerticalExaggeration, veOf, VE_CHOICES, veMatrix } from "../src/modules/viewer/verticalExaggeration.js";
import { collarMarkerMaterial, collarMarkerVertex, COLLAR_MARKER_UNIFORMS } from "../src/lib/viewer/collarMarkerShader.js";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule

const rig = (ve) => {
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100000);
  const camState = { current: { target: new THREE.Vector3(0, -40, 0), radius: 2000 } };
  camera.position.set(1500, 600, 1200); camera.lookAt(camState.current.target);
  setVerticalExaggeration(camera, camState, ve);
  camera.updateMatrixWorld(true);
  return { camera, camState };
};

test("the choices; the view matrix scales y about the orbit target; 1x leaves the camera alone", () => {
  assert.deepEqual(VE_CHOICES, [1, 2, 5, 10, 20]);
  assert.equal(veOf(10), 10); assert.equal(veOf("5"), 5); assert.equal(veOf(3), 1); assert.equal(veOf(undefined), 1);
  const p = new THREE.Vector3(100, -90, 50).applyMatrix4(veMatrix(10, -40));
  assert.ok(Math.abs(p.y - (-40 + 10 * -50)) < 1e-9 && p.x === 100 && p.z === 50);
  const a = rig(1).camera, b = rig(10).camera;
  const inv = a.matrixWorld.clone().invert();
  assert.ok(a.matrixWorldInverse.equals(inv)); // 1x: the plain inverse
  assert.ok(!b.matrixWorldInverse.equals(b.matrixWorld.clone().invert()));
  // a point 50 m under the target projects where the exaggerated point (500 m under) projects without VE
  const q = new THREE.Vector3(30, -90, 20).project(b);
  const q1 = new THREE.Vector3(30, -40 - 500, 20).project(a);
  assert.ok(q.distanceTo(q1) < 1e-9);
  // the target itself does not move
  assert.ok(new THREE.Vector3(0, -40, 0).project(b).distanceTo(new THREE.Vector3(0, -40, 0).project(a)) < 1e-9);
});

test("a pick at a drawn point hits the true object there (the ray is mapped back), at every VE", () => {
  for (const ve of [1, 2, 10, 20]) {
    const { camera } = rig(ve);
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
    box.position.set(120, -95, -60); box.updateMatrixWorld(true);
    const ndc = box.position.clone().project(camera); // where it is drawn
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hit = rc.intersectObject(box)[0];
    assert.ok(hit, `VE ${ve}: no hit`);
    assert.ok(hit.point.distanceTo(box.position) < 3.5, `VE ${ve}: ${hit.point.toArray()}`); // on the true 4 m box
  }
  // a camera never given a VE (the compass, the Layout capture's own) is untouched by the patched raycaster
  const other = new THREE.PerspectiveCamera(45, 1, 0.1, 1000); other.position.set(0, 0, 10); other.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0, 0.5), other);
  const ref = new THREE.Vector3(0, 0.5, 0.5).unproject(other).sub(other.position).normalize();
  assert.ok(rc.ray.direction.distanceTo(ref) < 1e-12);
});

test("a pan's vertical step is divided by VE (the drawn scene follows the cursor); other target moves are untouched", () => {
  const { camState } = rig(10);
  const t = camState.current.target;
  t.addScaledVector(new THREE.Vector3(0, 1, 0), 50);
  assert.equal(t.y, -40 + 5);
  t.addScaledVector(new THREE.Vector3(1, 0, 0), 30);
  assert.equal(t.x, 30);
  t.set(1, 2, 3); assert.deepEqual(t.toArray(), [1, 2, 3]);
  const r1 = rig(1).camState.current.target; r1.addScaledVector(new THREE.Vector3(0, 1, 0), 50);
  assert.equal(r1.y, 10);
});

test("collar markers: the shader undoes VE and floors the size; one hook, kept through a batch clone", () => {
  const vs = collarMarkerVertex("void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}");
  assert.match(vs, /uniform float uVE;/);
  assert.match(vs, /gsLocal\.y \/= max\(uVE, 1\.0\)/);
  assert.match(vs, /float gsK = max\(1\.0, uMinPx/);
  assert.doesNotMatch(vs, /#include <project_vertex>/);
  const m = collarMarkerMaterial(new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  const hook = m.onBeforeCompile;
  assert.equal(collarMarkerMaterial(m).onBeforeCompile, hook);
  const sh = { uniforms: {}, vertexShader: "#include <project_vertex>" };
  hook(sh);
  assert.equal(sh.uniforms.uVE, COLLAR_MARKER_UNIFORMS.uVE); // shared: a VE change recompiles nothing
  const c = m.clone();
  assert.ok(c.userData.collarMarker);
  assert.equal(collarMarkerMaterial(c).onBeforeCompile, hook);
  const lb = readFileSync(new URL("../src/lib/viewer/layerBatches.js", import.meta.url), "utf8");
  assert.match(lb, /if \(fam\.material\.userData\?\.collarMarker\) collarMarkerMaterial\(material\);/);
  const v = viewerSource();
  assert.match(v, /collarMaterialRef\.current = collarMarkerMaterial\(new THREE\.MeshBasicMaterial/);
});

test("the figure: VE set from its settings (saved with the view and themes), stated beside the scale bar, chosen in the Figure popover", () => {
  const o = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
  assert.match(o, /setVerticalExaggeration\(cameraRef\.current, camStateRef, ve\);/);
  assert.match(o, /tr\("VE \{v\}x", \{ v: ve \}\)/);
  assert.match(o, /if \(!config\.enabled\) return veTag \?/); // stated even with the overlay off
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(p, /aria-label=\{tr\("Vertical exaggeration"\)\} value=\{veOf\(figureOverlay\.ve\)\}/);
});

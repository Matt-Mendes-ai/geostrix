// TASKS.csv #2623 (review #2325, WA uranium) — vertical exaggeration in the 3D view (1 / 2 / 5 / 10 / 20x). A flat deposit (430 holes of
// 33-93 m on a 10.9 x 10.2 km block) was specks at Fit: a 60 m hole about 3 px long, the uranium horizon invisible as a layer.
//
// HOW: nothing in the scene is rescaled. The camera's view matrix gets a vertical scale about the orbit target's elevation
// (matrixWorldInverse x S, applied each time three recomputes it), so every object, its matrixWorld, the pick index (#304, built from
// matrixWorld) and every coordinate a tool reads stay true. Rendering, frustum culling and Vector3.project go through matrixWorldInverse
// and so show / place the exaggerated view; Raycaster.setFromCamera builds its ray from the camera's world matrix (the exaggerated
// frame), so it is mapped back through S's inverse here, once for every tool that picks. The pivot being the orbit target keeps Fit,
// fly-to and wheel-zoom-to-cursor (#2368) exact; a pan's vertical step is divided by VE so the scene follows the cursor.
// Sprites (labels) add their size in view space, so they are not stretched; collar markers are kept round and given a minimum size
// on screen by collarMarkerShader.js.
import * as THREE from "three";

export const VE_CHOICES = [1, 2, 5, 10, 20];
export const veOf = (v) => (VE_CHOICES.includes(Number(v)) ? Number(v) : 1);

// the vertical scale about elevation y0 (scene y): y -> y0 + ve (y - y0)
export function veMatrix(ve, y0, out = new THREE.Matrix4()) {
  return out.set(1, 0, 0, 0, 0, ve, 0, (1 - ve) * y0, 0, 0, 1, 0, 0, 0, 0, 1);
}
// a ray built in the exaggerated frame -> the true frame (mutates the ray)
export function unexaggerateRay(ray, ve, y0) {
  if (!(ve > 0) || ve === 1) return ray;
  ray.origin.y = y0 + (ray.origin.y - y0) / ve;
  ray.direction.y /= ve;
  ray.direction.normalize();
  return ray;
}

let rayPatched = false;
function patchRaycaster() {
  if (rayPatched) return;
  rayPatched = true;
  const orig = THREE.Raycaster.prototype.setFromCamera;
  THREE.Raycaster.prototype.setFromCamera = function setFromCameraVE(coords, camera) {
    orig.call(this, coords, camera);
    const ud = camera?.userData;
    if (ud && ud.ve > 1 && ud.vePivotY) unexaggerateRay(this.ray, ud.ve, ud.vePivotY());
  };
}

const _S = new THREE.Matrix4();
// camera: the 3D view's PerspectiveCamera; camStateRef: ViewerModule's ref to { target, radius, ... }; ve: one of VE_CHOICES
export function setVerticalExaggeration(camera, camStateRef, ve) {
  const camState = camStateRef?.current;
  if (!camera || !camState?.target) return;
  patchRaycaster();
  const ud = camera.userData;
  ud.ve = veOf(ve);
  ud.vePivotY = () => camStateRef.current?.target?.y ?? 0;
  if (!ud.veInstalled) {
    ud.veInstalled = true;
    const apply = () => { if (ud.ve > 1) camera.matrixWorldInverse.multiply(veMatrix(ud.ve, ud.vePivotY(), _S)); };
    const u1 = camera.updateMatrixWorld;
    camera.updateMatrixWorld = function updateMatrixWorldVE(force) { u1.call(this, force); apply(); };
    const u2 = camera.updateWorldMatrix;
    camera.updateWorldMatrix = function updateWorldMatrixVE(parents, children) { u2.call(this, parents, children); apply(); };
  }
  // the pan (ViewerModule's drag) moves the target along the camera's screen axes in the exaggerated frame: its vertical part is
  // divided by VE so the point under the cursor stays under it
  const t = camState.target;
  if (!t.__vePan) {
    t.__vePan = true;
    t.addScaledVector = function addScaledVectorVE(v, s) {
      const k = ud.ve > 1 ? 1 / ud.ve : 1;
      this.x += v.x * s; this.y += v.y * s * k; this.z += v.z * s;
      return this;
    };
  }
  camera.updateMatrixWorld(true);
}

// TASKS.csv #3765 (Scottie Gold review: a 67,344-cell chargeability model beside 33 holes; the 3D slice showed the model's cut face with the slab's 21
// holes buried inside its cells, only specks poking out) — in a 3D slice with a thickness, a block model is drawn as ONE cell-thick layer on the
// side of the slab away from the camera (its back wall), so the slab's holes stand in front of it, unobscured, over the model's colours. Without
// this every cell of the slab sat between the camera and the holes.
// The layer is a local clipping plane on each model's material, turned to the camera's side every frame (onBeforeRender); the slab's own two planes
// (slicePlanesRef, renderer.clippingPlanes) are untouched. A cut with no thickness ('everything beyond the cut') and the horizontal / vertical
// choice work the same: the geometry is just the slab's normal.
import { useEffect } from "react";
import * as THREE from "three";

// planes: slicePlanesRef.current — [keep u <= t/2 (normal -n), keep u >= -t/2 (normal n)] for a slab through c (u = n.(p - c)); camera: a position.
// -> { n, c (n.c), t, side (+1 | -1: the camera's side) } or null (no slab)
export function slabOf(planes, cam) {
  if (!Array.isArray(planes) || planes.length !== 2) return null;
  const [hi, lo] = planes, n = lo.normal, d0 = hi.constant, d1 = lo.constant;
  const t = d0 + d1, nc = (d0 - d1) / 2;
  if (!(t > 0)) return null;
  const u = n.x * cam.x + n.y * cam.y + n.z * cam.z - nc; // the camera's distance along n from the slab's middle
  return { n, nc, t, side: u >= 0 ? 1 : -1, u };
}
// the clipping plane that keeps only the layer of thickness w at the slab's far side (three keeps the side a plane's normal points to)
export function farLayerPlane(slab, w, out = new THREE.Plane()) {
  const { n, nc, t, side } = slab;
  if (side > 0) { out.normal.copy(n).negate(); out.constant = nc - t / 2 + w; } // keep u <= -t/2 + w
  else { out.normal.copy(n); out.constant = -nc - t / 2 + w; } // keep u >= t/2 - w
  return out;
}
// one cell's thickness along the slab's normal (scene axes: x east, y up, z = -north), at least 1 m
export function cellAlong(model, n) {
  const dx = Number(model?.dx) || 0, dy = Number(model?.dy) || 0, dz = Number(model?.dz) || 0;
  return Math.max(1, Math.abs(n.x) * dx + Math.abs(n.z) * dy + Math.abs(n.y) * dz);
}

export function useSliceModelFace({ voxelMeshesRef, slicePlanesRef, rendererRef, slice3d, voxelModels, refresh = [], enabled = true }) { // refresh: the voxel build's other inputs (it may make new meshes)
  const on = !!slice3d?.on && Number(slice3d.thickness) > 0 && enabled;
  useEffect(() => {
    const meshes = voxelMeshesRef.current || {};
    for (const [id, mesh] of Object.entries(meshes)) {
      const m = mesh?.material;
      if (!m) continue;
      if (!on || mesh.userData?.exposedFaces) { // a hollow exposed-face mesh is not used with a slice; off: put the draw back
        if (mesh.userData?.sliceFace) { m.clippingPlanes = null; m.needsUpdate = true; mesh.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; delete mesh.userData.sliceFace; }
        continue;
      }
      if (mesh.userData.sliceFace) continue;
      const plane = new THREE.Plane(), model = (voxelModels || []).find((v) => String(v.id) === String(id)) || mesh.userData?.srcModel;
      m.clippingPlanes = [plane]; m.needsUpdate = true;
      mesh.userData.sliceFace = true;
      mesh.onBeforeRender = (renderer, scene, camera) => {
        const slab = slabOf(slicePlanesRef.current, camera.position);
        const w = slab ? cellAlong(model, slab.n) : 0;
        if (slab && w < slab.t) farLayerPlane(slab, w, plane); else { plane.normal.set(0, 0, 0); plane.constant = 1; } // no layer: a plane that clips nothing
      };
    }
    if (rendererRef.current) rendererRef.current.localClippingEnabled = on || !!rendererRef.current.localClippingEnabled;
  }, [on, voxelModels, slice3d?.on, slice3d?.thickness, refresh[0], refresh[1]]);
}

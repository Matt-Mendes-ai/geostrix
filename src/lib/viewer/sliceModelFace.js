// TASKS.csv #4020 — the layer is now drawn as ONE filled colour map (lib/viewer/sliceMap.js) on a plane at the slab's far side, not the
// model's boxes clipped to a layer: three.js does not cap a clipped box, so the boxes left only their side walls, edge-on from above, a moiré
// of single-pixel dots (Matt: "mag and other voxels won't display well in the 3d slice"). The boxes are hidden while the slab is on.
// TASKS.csv #3765 (Scottie Gold review: a 67,344-cell chargeability model beside 33 holes; the 3D slice showed the model's cut face with the slab's 21
// holes buried inside its cells, only specks poking out) — in a 3D slice with a thickness, a block model is drawn as ONE cell-thick layer on the
// side of the slab away from the camera (its back wall), so the slab's holes stand in front of it, unobscured, over the model's colours. Without
// this every cell of the slab sat between the camera and the holes.
// The layer was a local clipping plane on each model's material (#3765; slabOf, farLayerPlane and cellAlong are its geometry, still used); since #4020
// it is the face below, turned to the camera's side every frame (onBeforeRender). The slab's own two planes (slicePlanesRef, renderer.clippingPlanes)
// are untouched. A cut with no thickness ('everything beyond the cut') keeps the boxes.
import * as THREE from "three";
import { sliceImage } from "./sliceMap.js"; // TASKS.csv #4020
import { buildVoxelLookup } from "../voxelSample.js";
import { voxelCellShown } from "./geomath.js";
import { makeVoxelColorResolverRGB } from "../layers.js";

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

// TASKS.csv #4020 — each model's shown cells and their lookup, once per model object (a slice moved by the slider reuses them)
const sampled = new WeakMap();
function modelCells(model) {
  let e = sampled.get(model);
  if (!e) { const cells = (model?.cells || []).filter((c) => voxelCellShown(model, c)); e = { cells, lookup: buildVoxelLookup(cells) }; sampled.set(model, e); }
  return e;
}
function dropFace(mesh) {
  const f = mesh.userData.sliceFaceMesh;
  if (!f) return;
  f.parent?.remove(f); f.geometry.dispose(); f.material.map?.dispose(); f.material.dispose();
  delete mesh.userData.sliceFaceMesh;
}
// the model's face: the image on a quad, placed every frame at the slab's far side from the camera (just inside it: the slab's own planes cut the rest)
function faceMesh(img, model, slicePlanesRef) {
  const tex = new THREE.DataTexture(img.rgba, img.width, img.height, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const { e1, e2 } = img, A = img.sizeA / 2, B = img.sizeB / 2;
  const corner = (sa, sb) => [e1.x * sa * A + e2.x * sb * B, e1.y * sa * A + e2.y * sb * B, e1.z * sa * A + e2.z * sb * B];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...corner(-1, -1), ...corner(1, -1), ...corner(1, 1), ...corner(-1, 1)], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const opacity = model?.opacity ?? 0.85;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: opacity < 1, opacity, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  const face = new THREE.Mesh(g, m);
  face.name = "voxelSliceFace"; face.frustumCulled = false; face.visible = model?.visible !== false;
  face.userData.reduce = img.reduce;
  const c = img.centre;
  face.onBeforeRender = (renderer, scene, camera) => {
    const slab = slabOf(slicePlanesRef.current, camera.position);
    if (!slab) return;
    const eps = Math.min(0.5, slab.t / 4), u = slab.side > 0 ? -slab.t / 2 + eps : slab.t / 2 - eps; // the far side, inside the slab
    face.position.set(c.x + slab.n.x * u, c.y + slab.n.y * u, c.z + slab.n.z * u);
    face.updateMatrixWorld();
  };
  return face;
}

// Puts the face on (or takes it off) every voxel mesh: on = a slice with a thickness is on. origin: the scene origin (world). -> [{ id, reduce }]
// for the slice pane's line (what a thick slab shows)
export function applySliceFace({ voxelMeshesRef, slicePlanesRef, voxelModels, on, origin }) {
  const meshes = voxelMeshesRef.current || {}, out = [];
  const slab = on ? slabOf(slicePlanesRef.current, { x: 0, y: 0, z: 0 }) : null;
  for (const [id, mesh] of Object.entries(meshes)) {
    const m = mesh?.material;
    if (!m) continue;
    dropFace(mesh);
    if (!on || !slab || mesh.userData?.exposedFaces) { m.visible = true; continue; } // off, a cut with no thickness, or a hollow face mesh (not built with a slice)
    const model = (voxelModels || []).find((v) => String(v.id) === String(id)) || mesh.userData?.srcModel;
    const { cells, lookup } = modelCells(model);
    const img = sliceImage({ cells, lookup, slab: { n: { x: slab.n.x, y: slab.n.y, z: slab.n.z }, nc: slab.nc, t: slab.t }, origin, rgb: makeVoxelColorResolverRGB(model), discrete: model?.colorMode === "discrete" });
    m.visible = false; // the boxes, clipped, are walls only: the face shows the slab (and nothing when the slab misses the model)
    if (!img) continue;
    const face = faceMesh(img, model, slicePlanesRef);
    mesh.parent?.add(face);
    mesh.userData.sliceFaceMesh = face;
    if (model?.visible !== false) out.push({ id, reduce: img.reduce });
  }
  return out;
}

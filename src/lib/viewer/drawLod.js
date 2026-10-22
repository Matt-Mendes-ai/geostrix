// TASKS.csv #795 — big model meshes are DRAWN from a simplified copy (lib/meshLod.js) while the mesh itself stays exactly
// as it was for everything that computes with it (volumes, exports, sections, queries, solids, sculpting read
// mesh.geometry; it is never touched). How:
//   - the drawing copy is a child of the mesh: a BufferGeometry sharing the mesh's own attributes (positions, normals,
//     colours - an in-place edit shows at once) with the simplified index, and the mesh's material through a getter,
//     so colour / opacity / clipping changes apply to what is drawn;
//   - the mesh goes onto the pick-only layer: not drawn, still hit by the pickers that enable that layer; for the
//     others the copy's raycast forwards to the mesh, so a pick always reports the full mesh and its exact surface.
// syncDrawLods(meshes, surfaces, { pickLayer, onDone }) - call when the surface list changes; a mesh whose geometry was
// replaced gets a new copy, one that became small enough is drawn whole again.
import * as THREE from "three";
import { lodPlan } from "../meshLod.js";
import { simplifyForDrawing } from "../meshLodClient.js";

const triCount = (g) => (g?.index ? g.index.count : (g?.attributes?.position?.count || 0)) / 3;

export function dropDrawLod(mesh, defaultLayer = 0) {
  const lod = mesh?.userData?.lod;
  if (!lod) return;
  mesh.remove(lod.child);
  lod.child.geometry.setIndex(null);
  mesh.layers.set(defaultLayer);
  if (lod.tipNote && typeof mesh.userData.tip === "string") mesh.userData.tip = mesh.userData.tip.replace(lod.tipNote, "");
  delete mesh.userData.lod;
}

export function syncDrawLods(meshes, surfaces, { pickLayer, onDone } = {}) {
  for (const s of surfaces || []) {
    const mesh = meshes[s.id];
    if (!mesh?.isMesh || s.type === "explicit_surface") continue; // explicit surfaces rebuild as you pick: drawn whole
    const geo = mesh.geometry, tris = triCount(geo), plan = lodPlan(tris);
    if (mesh.userData.lod && (mesh.userData.lod.source !== geo || !plan)) dropDrawLod(mesh);
    if (!plan || mesh.userData.lod || mesh.userData.lodPending === geo || !geo?.attributes?.position) continue;
    mesh.userData.lodPending = geo;
    const pos = geo.attributes.position.array;
    const index = geo.index ? geo.index.array : Uint32Array.from({ length: geo.attributes.position.count }, (_, i) => i);
    simplifyForDrawing(pos, index, plan).then((r) => {
      if (mesh.userData.lodPending === geo) delete mesh.userData.lodPending;
      if (mesh.geometry !== geo || !mesh.parent || r.triangles >= tris * 0.9) return; // replaced, removed, or no real gain
      const draw = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geo.attributes)) draw.setAttribute(name, attr);
      draw.setIndex(new THREE.BufferAttribute(r.index, 1));
      draw.boundingSphere = geo.boundingSphere?.clone() || null;
      if (!draw.boundingSphere) draw.computeBoundingSphere();
      const child = new THREE.Mesh(draw);
      Object.defineProperty(child, "material", { get: () => mesh.material, set: () => {}, configurable: true });
      child.name = "drawing copy (#795)";
      child.renderOrder = mesh.renderOrder;
      child.raycast = (rc, out) => { if (!rc.layers.isEnabled(pickLayer)) mesh.raycast(rc, out); };
      mesh.add(child);
      mesh.layers.set(pickLayer);
      const tipNote = `\nDrawn with ${Math.round(r.triangles).toLocaleString()} of ${Math.round(tris).toLocaleString()} triangles (the full mesh is used for volumes, sections and export)`;
      if (typeof mesh.userData.tip === "string") mesh.userData.tip += tipNote;
      mesh.userData.lod = { source: geo, child, triangles: r.triangles, full: tris, error: r.error, tipNote };
      onDone?.(mesh, r);
    }).catch(() => { if (mesh.userData.lodPending === geo) delete mesh.userData.lodPending; });
  }
}

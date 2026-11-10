// The layer batching of the 3D view (TASKS.csv #312 / #436 / #695 / #1500 / #1540), moved out of ViewerModule.jsx unchanged to keep
// it under its size cap (#1084): every drillhole interval, assay marker and point is a pick target, drawn through one InstancedMesh
// per family of identical members. See the comments below and ViewerModule's #695 / #1500 notes for why each step is there.
import * as THREE from "three";
import { PICK_ONLY_LAYER } from "./pickStandIn.js";
import { collarMarkerMaterial } from "./collarMarkerShader.js"; // TASKS.csv #2623
export { collarMarkerMaterial }; // for ViewerModule (its size cap)

// Below this, an InstancedMesh (and its per-instance buffers) costs more than the draw calls it
// saves — a handful of collar markers is not worth batching.
const BATCH_MIN_MEMBERS = 24;

// TASKS.csv #695 — what a batched (never drawn) member keeps of its material; see buildLayerBatches
export function pickOnlyMaterial(src) {
  return { isPickOnlyMaterial: true, color: src.color, side: src.side, transparent: src.transparent, opacity: src.opacity, visible: true, dispose() {} };
}

const _batchMatrix = new THREE.Matrix4();
const _batchZero = new THREE.Vector3(0, 0, 0);
// Mirrors the current state of a batch's member objects into its instance buffers. Called after a
// rebuild and after every in-place mutation of a member (applyCategoryVisibility's .visible flips,
// applyLegendOverrideColors' material.color repaints, the visibleHoles effect's .visible flips).
// A hidden member is written as a zero-scale matrix, which collapses its triangles to a point so
// nothing rasterizes — the instance is still there, so re-showing it is just another matrix write
// and never a rebuild.
export function syncBatchedInstances(inst) {
  const members = inst.userData.batchMembers;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    m.updateMatrix();
    // #695 — a member's world matrix is no longer refreshed by the render loop (see buildLayerBatches), so a change
    // made here must refresh it too, or picking would test the old placement
    m.updateMatrixWorld();
    _batchMatrix.copy(m.matrix);
    if (m.visible === false) _batchMatrix.scale(_batchZero);
    inst.setMatrixAt(i, _batchMatrix);
    inst.setColorAt(i, m.material.color);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  // Both are cached and would otherwise go stale: boundingSphere drives frustum culling, boundingBox
  // drives zoomToLayer's Box3.setFromObject.
  inst.boundingBox = null;
  inst.boundingSphere = null;
}

// Builds the InstancedMesh mirrors for one already-populated layer group. Members are grouped by
// (shared prototype geometry + every material property that affects how it draws), so two objects
// only ever share a draw call when they would have rendered identically apart from colour and
// transform. Anything without a shared prototype geometry (a curved TubeGeometry interval, a
// drillhole trace Line, a hole-label Sprite) is simply not a candidate and keeps drawing as before.
export function buildLayerBatches(group) {
  const families = new Map(), dropped = new Set(); // dropped: #1540
  for (const child of group.children) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    if (child.userData.batched) continue; // #695 — already mirrored by a batch (and holding a pick-only material)
    const protoKey = child.geometry?.userData?.protoKey;
    if (!protoKey) continue;
    const m = child.material;
    if (!m || Array.isArray(m) || !m.color) continue;
    const sig = `${protoKey}|${m.type}|${m.transparent ? 1 : 0}|${m.opacity}|${m.side}|${m.depthWrite ? 1 : 0}|${m.depthTest ? 1 : 0}`;
    let fam = families.get(sig);
    if (!fam) families.set(sig, (fam = { geometry: child.geometry, material: m, members: [] }));
    fam.members.push(child);
  }
  const promote = new Map(); // #1500 — a stand-in in a family too small to batch becomes a real Mesh, drawn on its own
  for (const fam of families.values()) {
    if (fam.members.length < BATCH_MIN_MEMBERS) { for (const m of fam.members) if (m.isPickStandIn) promote.set(m, m.toMesh()); continue; }
    const material = fam.material.isPickOnlyMaterial
      ? new THREE.MeshLambertMaterial({ transparent: fam.material.transparent, opacity: fam.material.opacity, side: fam.material.side }) // a stand-in family (#1500)
      : fam.material.clone();
    if (fam.material.userData?.collarMarker) collarMarkerMaterial(material); // #2623 — a clone keeps the flag, not the shader hook
    // Per-instance colour comes from instanceColor, which the shader MULTIPLIES by the material's
    // own diffuse colour — so the batch material must be white or every interval would be tinted by
    // whichever member happened to be cloned. (Do NOT set vertexColors:true here either; see the
    // voxel InstancedMesh's own comment for the black-render bug that causes.)
    material.color.setHex(0xffffff);
    // three.js draws a transparent object's instances in fixed array order, not back-to-front, and
    // the whole batch now sorts as ONE object at the group's origin instead of as thousands of
    // individually depth-sorted tubes. With depthWrite left on, an instance that happens to be
    // drawn first would depth-reject everything behind it and whole tubes would visibly disappear
    // as the camera moves. depthWrite:false (exactly what #201 did for transparent voxels, for the
    // same reason) removes that: every instance blends over what is already there. Blend ORDER is
    // still approximate for overlapping transparent tubes, which is the one accepted visual
    // trade-off of this row — opaque layers are unaffected and keep depthWrite:true.
    if (material.transparent) material.depthWrite = false;
    const inst = new THREE.InstancedMesh(fam.geometry, material, fam.members.length);
    // Never a pick target: pickHoverTargets skips it, so a hit always resolves to the real
    // per-interval object and never to the batch (which could not answer "which interval?").
    inst.userData.pickIgnore = true;
    inst.userData.batchMembers = fam.members;
    // TASKS.csv #436 — a pick-only member never moves after the build (syncBatchedInstances calls
    // updateMatrix() itself on any change), so three.js need not re-compose its local matrix from
    // position/quaternion/scale on every rendered frame: measured 10.5 -> 6.2 ms per frame of pure CPU
    // at 60,000 intervals (~200 holes). World matrices keep updating (a parent transform stays correct).
    // TASKS.csv #695 — and its WORLD matrix need not be re-multiplied every frame either. That only pays off if
    // the ancestors stop recomposing too: three.js's updateMatrixWorld() forces the whole subtree whenever a
    // parent with matrixAutoUpdate recomposes its own matrix, which the scene, root and layer group did every
    // frame. None of them is ever moved (layer content is rebuilt, never transformed - see #304's pick-index
    // contract), so they are frozen here and at scene setup. Measured in Node, three r160, 250,000 members:
    // updateMatrixWorld 39.3 -> 3.9 ms per frame. matrixWorld is computed once now, which also means a pick
    // between a rebuild and the next frame sees the right placement.
    group.updateWorldMatrix(true, false);
    group.matrixAutoUpdate = false;
    for (const m of fam.members) {
      if (m.isPickStandIn) { m.updateMatrix(); m.updateMatrixWorld(); m.userData.batched = true; continue; } // #1500 — already the pick-only form, on the pick-only channel
      m.layers.set(PICK_ONLY_LAYER); m.updateMatrix(); m.matrixAutoUpdate = false; m.updateMatrixWorld(); m.matrixWorldAutoUpdate = false;
      // TASKS.csv #695 — a member is never drawn, so its MeshLambertMaterial (~1.2 kB of heap each, measured) only
      // ever answered two questions: its colour (read by syncBatchedInstances, repainted by applyLegendOverrideColors)
      // and its face side (read by Mesh.raycast). A stand-in holding just those is ~0.2 kB: about 160 MB less for an
      // 83k-assay project showing two elements. The original was never rendered, so it holds no GPU resources.
      m.material = pickOnlyMaterial(m.material);
      m.userData.batched = true;
    }
    group.add(inst);
    syncBatchedInstances(inst);
    for (const m of fam.members) dropped.add(m);
  }
  // TASKS.csv #1540 (review #1497, Lawyers) — a batched member is never drawn, yet as a child of the group it was still walked by
  // every frame's projectObject and updateMatrixWorld: on Lawyers (446 holes, ~146,000 intervals) that walk was two thirds of a
  // 55 ms orbit frame (projectObject 906 ms of a 1,377 ms render over 2.1 s, CPU profile of the built app). The members leave the
  // children array but keep `parent` (identify, the hit kind and firstVisibleLayerHit walk `.parent` up to the group and the scene)
  // and their frozen matrixWorld (#695); everything that needs them reaches them through the batch's batchMembers (eachLayerMember).
  // A clear of the group pops its children: a member holds no GPU resource (a shared prototype geometry, a pick-only material), so
  // it needs no disposal and goes with its batch.
  if (dropped.size) group.children = group.children.filter((c) => !dropped.has(c));
  if (promote.size) { group.children = group.children.map((c) => { const real = promote.get(c); if (!real) return c; real.parent = group; c.parent = null; return real; }); group.updateMatrixWorld(true); } // #1500
}
// TASKS.csv #1540 — every pickable member of a layer group: the unbatched children and each batch's members
export function eachLayerMember(g, fn) {
  for (const c of g.children) {
    const bm = c.userData?.batchMembers;
    if (bm) { for (let i = 0; i < bm.length; i++) fn(bm[i]); } else if (!c.userData?.pickIgnore) fn(c);
  }
}

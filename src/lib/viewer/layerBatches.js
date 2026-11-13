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

// ---------- TASKS.csv #1643: compact batches ----------
// A batch of pick stand-ins (#1500: intervals, point markers, custom rows, assays, geophysics readings, surface samples) kept every
// member as an object (~1.2 kB each: vectors, a quaternion, two matrices, a colour): 174 MB on Lawyers' ~142,000. A COMPACT batch keeps
// what the members held in arrays on the batch (userData.compact): each row's userData (its tip, row, hole id, category), its placement
// (16 floats), a hidden flag, and its colour in the batch's own instanceColor. Readers see an InstanceView per instance - through
// eachLayerMember (the category / legend / Holes-list passes: userData, visible, material.color, parent) and through the pick index
// (pickIndex.js: one box per instance; a candidate is an InstanceView that ray-casts as the member Mesh did and reports itself as the
// hit's object, with the same userData / parent / visible the hit consumers read).
const PICK_LAYERS = new THREE.Layers();
PICK_LAYERS.set(PICK_ONLY_LAYER);
const _cv = new THREE.Color();
// an instance's colour, read and written in its batch's instanceColor
class InstanceColor {
  constructor(batch, i) { this.batch = batch; this.i = i; this.isColor = true; }
  get r() { return this.batch.instanceColor.array[this.i * 3]; }
  get g() { return this.batch.instanceColor.array[this.i * 3 + 1]; }
  get b() { return this.batch.instanceColor.array[this.i * 3 + 2]; }
  set(v) { _cv.set(v); const a = this.batch.instanceColor.array, o = this.i * 3; a[o] = _cv.r; a[o + 1] = _cv.g; a[o + 2] = _cv.b; return this; }
  setHex(h) { return this.set(h); }
  copy(c) { const a = this.batch.instanceColor.array, o = this.i * 3; a[o] = c.r; a[o + 1] = c.g; a[o + 2] = c.b; return this; }
  getHex() { return _cv.setRGB(this.r, this.g, this.b).getHex(); }
  clone() { return new THREE.Color(this.r, this.g, this.b); }
}
export class InstanceView {
  constructor(batch, i) { this.batch = batch; this.i = i; this._mw = null; this._mat = null; }
  get instanceId() { return this.i; }
  get userData() { return this.batch.userData.compact.rows[this.i]; }
  get visible() { return !this.batch.userData.compact.hidden[this.i]; }
  set visible(v) { this.batch.userData.compact.hidden[this.i] = v === false ? 1 : 0; }
  get parent() { return this.batch.parent; }
  get geometry() { return this.batch.geometry; }
  get layers() { return PICK_LAYERS; }
  get matrixWorld() { return this._mw || (this._mw = new THREE.Matrix4().fromArray(this.batch.userData.compact.base, this.i * 16).premultiply(this.batch.matrixWorld)); }
  get material() {
    if (!this._mat) { const cp = this.batch.userData.compact; this._mat = { isPickOnlyMaterial: true, side: cp.side, transparent: cp.transparent, opacity: cp.opacity, visible: true, color: new InstanceColor(this.batch, this.i), dispose() {} }; }
    return this._mat;
  }
  getWorldPosition(t) { return t.setFromMatrixPosition(this.matrixWorld); }
}
InstanceView.prototype.isObject3D = true;
InstanceView.prototype.isMesh = true;
InstanceView.prototype.isInstanceView = true;
InstanceView.prototype.raycast = THREE.Mesh.prototype.raycast;
InstanceView.prototype._computeIntersections = THREE.Mesh.prototype._computeIntersections;
InstanceView.prototype.getVertexPosition = THREE.Mesh.prototype.getVertexPosition;

// stand-ins (all of one family) -> the batch's compact record; their colours go into its instanceColor
function makeCompact(inst, members, material) {
  const n = members.length, base = new Float32Array(n * 16), rows = new Array(n), hidden = new Uint8Array(n), col = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const m = members[k];
    _batchMatrix.compose(m.position, m.quaternion, m.scale).toArray(base, k * 16);
    rows[k] = m.userData;
    if (m.visible === false) hidden[k] = 1;
    const c = m.material.baseColor || m.material.color; col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; // baseColor: no copy (#1643)
  }
  inst.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
  inst.userData.compact = { rows, base, hidden, side: material.side, transparent: material.transparent, opacity: material.opacity, view: (i) => new InstanceView(inst, i) };
}
function syncCompact(inst) {
  const { base, hidden } = inst.userData.compact, a = inst.instanceMatrix.array;
  a.set(base);
  for (let i = 0; i < hidden.length; i++) if (hidden[i]) { const o = i * 16; a[o] = a[o + 1] = a[o + 2] = a[o + 4] = a[o + 5] = a[o + 6] = a[o + 8] = a[o + 9] = a[o + 10] = 0; } // zero scale, as below
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.boundingBox = null;
  inst.boundingSphere = null;
}

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
  if (inst.userData.compact) { syncCompact(inst); return; } // #1643
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
  let prev = null, prevFam = null; // TASKS.csv #1643 — a row drawn like the one before joins its family without a key string
  for (const child of group.children) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    if (child.userData.batched) continue; // #695 — already mirrored by a batch (and holding a pick-only material)
    const protoKey = child.geometry?.userData?.protoKey;
    if (!protoKey) continue;
    const m = child.material;
    if (!m || Array.isArray(m) || !(m.baseColor || m.color)) continue; // baseColor: a stand-in's, without copying it (#1643)
    if (prev && child.geometry === prev.geometry && m.type === prev.type && m.transparent === prev.transparent && m.opacity === prev.opacity && m.side === prev.side && m.depthWrite === prev.depthWrite && m.depthTest === prev.depthTest) { prevFam.members.push(child); continue; }
    const sig = `${protoKey}|${m.type}|${m.transparent ? 1 : 0}|${m.opacity}|${m.side}|${m.depthWrite ? 1 : 0}|${m.depthTest ? 1 : 0}`;
    let fam = families.get(sig);
    if (!fam) families.set(sig, (fam = { geometry: child.geometry, material: m, members: [] }));
    fam.members.push(child);
    prev = { geometry: child.geometry, type: m.type, transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, depthTest: m.depthTest }; prevFam = fam;
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
    if (material.transparent && material.opacity < 1) material.depthWrite = false; // #2776 — opacity 1 (collar markers over a flat raster) keeps its depth
    const inst = new THREE.InstancedMesh(fam.geometry, material, fam.members.length);
    inst.renderOrder = fam.members[0].renderOrder || 0; // #2776 — the members' draw order (collar markers: after a flat raster)
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
    // TASKS.csv #1643 — a family of stand-ins only (no real Mesh among them) becomes a compact batch: no member objects are kept
    if (fam.members.every((m) => m.isPickStandIn)) {
      inst.userData.pickIgnore = true;
      delete inst.userData.batchMembers; // the members are not kept
      makeCompact(inst, fam.members, fam.material);
      group.add(inst);
      syncCompact(inst);
      for (const m of fam.members) dropped.add(m);
      continue;
    }
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
// TASKS.csv #3055 — a compact batch made straight from arrays, with no stand-in per row (the assay markers: 148,000 samples on WA iron made
// as many stand-ins, then grouped and copied into these same arrays). The steps buildLayerBatches takes for a stand-in family (#1643).
// base: Float32Array, 16 per row (each row's matrix); rows: the userData per row; col: Float32Array, 3 per row (linear RGB, as THREE.Color)
export function addCompactBatch(group, geometry, { transparent = false, opacity = 1, side = THREE.FrontSide } = {}, base, rows, col) {
  const material = new THREE.MeshLambertMaterial({ transparent, opacity, side });
  material.color.setHex(0xffffff);
  if (material.transparent && material.opacity < 1) material.depthWrite = false; // as buildLayerBatches (#2776)
  const inst = new THREE.InstancedMesh(geometry, material, rows.length);
  inst.userData.pickIgnore = true;
  group.updateWorldMatrix(true, false);
  group.matrixAutoUpdate = false; // #695
  inst.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
  inst.userData.compact = { rows, base, hidden: new Uint8Array(rows.length), side, transparent, opacity, view: (i) => new InstanceView(inst, i) };
  group.add(inst);
  syncCompact(inst);
  return inst;
}
// TASKS.csv #1540 — every pickable member of a layer group: the unbatched children and each batch's members
export function eachLayerMember(g, fn) {
  for (const c of g.children) {
    const bm = c.userData?.batchMembers, cp = c.userData?.compact;
    if (bm) { for (let i = 0; i < bm.length; i++) fn(bm[i]); } else if (cp) { for (let i = 0; i < cp.rows.length; i++) fn(new InstanceView(c, i)); } else if (!c.userData?.pickIgnore) fn(c); // #1643: a view per instance
  }
}
// ViewerModule's pickTargetsSignature, per child of a layer group (TASKS.csv #1540, moved here for its size cap with #1643): a batch's
// members are no longer children, so each batch is tagged by its members' count, first / last id and sampled world translations
// (O(batches), never O(members)); a compact batch by its id and size (it is rebuilt, never moved); anything else adds nothing
export function batchTag(c) {
  const cp = c.userData?.compact;
  if (cp) return `#c${c.id}:${cp.rows.length}`;
  const bm = c.userData?.batchMembers;
  if (!bm || !bm.length) return "";
  const a = bm[0].matrixWorld.elements, b = bm[bm.length - 1].matrixWorld.elements;
  return `#${bm.length}:${bm[0].id}:${bm[bm.length - 1].id}@${a[0]},${a[12]},${a[13]},${a[14]},${b[0]},${b[12]},${b[13]},${b[14]}`; // [0]: a collar marker resized in place (#2823)
}
// TASKS.csv #1643 — the pick list: a compact batch itself (pickIndex.js boxes its instances), every other member as eachLayerMember
export function eachPickTarget(g, fn) {
  for (const c of g.children) {
    if (c.userData?.compact) { fn(c); continue; }
    const bm = c.userData?.batchMembers;
    if (bm) { for (let i = 0; i < bm.length; i++) fn(bm[i]); } else if (!c.userData?.pickIgnore) fn(c);
  }
}

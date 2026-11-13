// TASKS.csv #3117 (the rest of #3055, WA iron) — switching an assay element on rebuilt every shown element's markers (148,000 Fe
// samples rebuilt to add Si), because each element sits on a ring around the trace whose offsets depend on how many are shown. Each
// element's markers are now its own batches, kept while that element's inputs are the same; a kept element whose ring offset changed
// is moved in place (its instance matrices' translation), so adding an element builds only that element's markers.
import * as THREE from "three";

// as ViewerModule's clearGroup: a shared prototype geometry is never disposed
const disposeChild = (c) => { if (!c.geometry?.userData?.sharedProto) c.geometry?.dispose?.(); c.material?.map?.dispose?.(); c.material?.dispose?.(); c.dispose?.(); };
// the same refs, in order (a style object, the samples array, the traces...)
export const sameKey = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

// one kept child moved by (dx, dz) in scene x / z. -> false when it cannot be moved in place (the element is rebuilt instead)
export function shiftMarkers(c, dx, dz) {
  const cp = c.userData?.compact;
  if (cp) { // a compact batch (#1643 / #3055): its base matrices and the drawn ones (a hidden row keeps its translation)
    const a = c.instanceMatrix.array;
    for (let o = 0; o < cp.base.length; o += 16) { cp.base[o + 12] += dx; cp.base[o + 14] += dz; a[o + 12] += dx; a[o + 14] += dz; }
    c.instanceMatrix.needsUpdate = true; c.boundingBox = null; c.boundingSphere = null;
    return true;
  }
  if (c.isMesh && !c.isInstancedMesh) { c.position.x += dx; c.position.z += dz; c.updateMatrix(); c.updateMatrixWorld(); return true; } // a family under 24 (#1500)
  return false;
}

// group: the assay layer group. kept: a Map element -> { key, kids, offX, offZ } held across builds.
// specs: the shown elements, in order: [{ sym, key, offX, offZ }]. build(sym, into): draws one element's markers into `into` (a scratch
// group, so buildLayerBatches sees only that element's stand-ins). -> { built: [sym], moved: [sym], kept: [sym] }
export function syncAssayElements(group, kept, specs, build) {
  const want = new Map(specs.map((s) => [s.sym, s]));
  const out = { built: [], moved: [], kept: [] };
  const drop = (sym) => { const k = kept.get(sym); kept.delete(sym); for (const c of k?.kids || []) { if (c.parent === group) group.remove(c); disposeChild(c); } };
  for (const [sym, k] of [...kept]) if (!want.has(sym) || !sameKey(k.key, want.get(sym).key) || k.kids.some((c) => c.parent !== group)) drop(sym);
  // anything in the group no kept element owns (a build from before #3117, or a clear from outside) goes
  const owned = new Set(); for (const k of kept.values()) for (const c of k.kids) owned.add(c);
  for (const c of [...group.children]) if (!owned.has(c)) { group.remove(c); disposeChild(c); }
  for (const s of specs) {
    const k = kept.get(s.sym);
    if (k) {
      const dx = s.offX - k.offX, dz = s.offZ - k.offZ;
      if (dx || dz) {
        if (k.kids.every((c) => shiftMarkers(c, dx, dz))) { k.offX = s.offX; k.offZ = s.offZ; out.moved.push(s.sym); continue; }
        drop(s.sym);
      } else { out.kept.push(s.sym); continue; }
    }
    const into = new THREE.Group();
    build(s.sym, into);
    const kids = [...into.children];
    for (const c of kids) group.add(c);
    if (kids.length) { group.updateWorldMatrix(true, false); group.matrixAutoUpdate = false; } // #695, as buildLayerBatches
    kept.set(s.sym, { key: s.key, kids, offX: s.offX, offZ: s.offZ });
    out.built.push(s.sym);
  }
  return out;
}

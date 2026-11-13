// TASKS.csv #3117 (the rest of #3055, WA iron) — switching an assay element on rebuilt every shown element's markers (148,000 Fe
// samples rebuilt to add Si), because each element sits on a ring around the trace whose offsets depend on how many are shown. Each
// element's markers are now its own batches, kept while that element's inputs are the same; a kept element whose ring offset changed
// is moved in place (its instance matrices' translation), so adding an element builds only that element's markers.
import * as THREE from "three";
import { lodWanted } from "./assayLod.js"; // TASKS.csv #3144

// as ViewerModule's clearGroup: a shared prototype geometry is never disposed
const disposeChild = (c) => { if (!c.geometry?.userData?.sharedProto) c.geometry?.dispose?.(); c.material?.map?.dispose?.(); c.material?.dispose?.(); c.dispose?.(); };
// the same refs, in order (a style object, the samples array, the traces...)
export const sameKey = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

// one kept child moved by (dx, dz) in scene x / z. -> false when it cannot be moved in place (the element is rebuilt instead). The pick index
// (#304) assumes a pickable object is rebuilt, never moved: a moved compact batch counts its moves, which batchTag reads, so the index is
// rebuilt; a plain mesh (a family under 24) is not moved but rebuilt with its element, as the group signature samples only two children.
export function shiftMarkers(c, dx, dz) {
  const cp = c.userData?.compact;
  if (cp) { // a compact batch (#1643 / #3055): its base matrices and the drawn ones (a hidden row keeps its translation)
    const a = c.instanceMatrix.array;
    for (let o = 0; o < cp.base.length; o += 16) { cp.base[o + 12] += dx; cp.base[o + 14] += dz; a[o + 12] += dx; a[o + 14] += dz; }
    c.instanceMatrix.needsUpdate = true; c.boundingBox = null; c.boundingSphere = null;
    cp.moves = (cp.moves || 0) + 1;
    return true;
  }
  return false;
}

// group: the assay layer group. kept: a Map element -> { key, kids, offX, offZ } held across builds.
// specs: the shown elements, in order: [{ sym, key, offX, offZ }]. build(sym, into): draws one element's markers into `into` (a scratch
// group, so buildLayerBatches sees only that element's stand-ins). -> { built: [sym], moved: [sym], kept: [sym] }
export function syncAssayElements(group, kept, specs, build) {
  const want = new Map(specs.map((s) => [s.sym, s]));
  const out = { built: [], moved: [], kept: [] };
  const drop = (sym) => { const k = kept.get(sym); kept.delete(sym); for (const c of [...(k?.kids || []), ...(k?.coarse || [])]) { if (c.parent === group) group.remove(c); disposeChild(c); } }; // coarse: #3144
  for (const [sym, k] of [...kept]) if (!want.has(sym) || !sameKey(k.key, want.get(sym).key) || k.kids.some((c) => c.parent !== group)) drop(sym);
  // anything in the group no kept element owns (a build from before #3117, or a clear from outside) goes
  const owned = new Set(); for (const k of kept.values()) for (const c of [...k.kids, ...(k.coarse || [])]) owned.add(c);
  for (const c of [...group.children]) if (!owned.has(c)) { group.remove(c); disposeChild(c); }
  for (const s of specs) {
    const k = kept.get(s.sym);
    if (k) {
      const dx = s.offX - k.offX, dz = s.offZ - k.offZ;
      if (dx || dz) {
        if ([...k.kids, ...(k.coarse || [])].every((c) => shiftMarkers(c, dx, dz))) { k.offX = s.offX; k.offZ = s.offZ; out.moved.push(s.sym); continue; }
        drop(s.sym);
      } else { out.kept.push(s.sym); continue; }
    }
    const into = new THREE.Group();
    build(s.sym, into);
    const kids = [...into.children];
    for (const c of kids) group.add(c);
    if (kids.length) { group.updateWorldMatrix(true, false); group.matrixAutoUpdate = false; } // #695, as buildLayerBatches
    const entry = { key: s.key, kids, offX: s.offX, offZ: s.offZ, coarse: null };
    // TASKS.csv #3144 — the level of detail, built the first time it is needed (setAssayLod), at the element's offset then
    if (s.buildCoarse) entry.buildCoarse = () => { const c = new THREE.Group(); s.buildCoarse(s.sym, c, entry.offX, entry.offZ); entry.coarse = [...c.children]; for (const x of entry.coarse) group.add(x); copyHidden(entry.kids, entry.coarse); };
    kept.set(s.sym, entry);
    out.built.push(s.sym);
  }
  return out;
}

// TASKS.csv #3144 — a coarse set built after holes were hidden (the Holes list) or classes filtered keeps that: a merged marker is hidden when
// every full-set marker of its hole and colour is. Keyed by hole id and instance colour (both sets colour a class alike).
const rgbKey = (a, i) => (a ? `${a[i * 3].toFixed(3)},${a[i * 3 + 1].toFixed(3)},${a[i * 3 + 2].toFixed(3)}` : "");
function copyHidden(full, coarse) {
  const seen = new Map();
  let any = false;
  for (const f of full) {
    const cp = f.userData?.compact;
    if (cp) for (let i = 0; i < cp.rows.length; i++) { const k = `${cp.rows[i]?.holeId}|${rgbKey(f.instanceColor?.array, i)}`, e = seen.get(k) || [0, 0]; e[1]++; if (cp.hidden[i]) { e[0]++; any = true; } seen.set(k, e); }
    else if (f.isMesh && f.visible === false) any = true;
  }
  if (!any) return;
  for (const c of coarse) {
    const cp = c.userData?.compact;
    if (!cp) continue;
    const a = c.instanceMatrix.array;
    for (let i = 0; i < cp.rows.length; i++) {
      const e = seen.get(`${cp.rows[i]?.holeId}|${rgbKey(c.instanceColor?.array, i)}`);
      if (e && e[0] === e[1]) { cp.hidden[i] = 1; const o = i * 16; a[o] = a[o + 1] = a[o + 2] = a[o + 4] = a[o + 5] = a[o + 6] = a[o + 8] = a[o + 9] = a[o + 10] = 0; }
    }
    c.instanceMatrix.needsUpdate = true;
  }
}

// TASKS.csv #3144 — draw each element's coarse set (building it the first time) or its full one
export function setAssayLod(group, kept, on) {
  for (const k of kept.values()) {
    if (on && !k.coarse && k.buildCoarse) k.buildCoarse();
    const coarse = !!(on && k.coarse);
    for (const c of k.kids) c.visible = !coarse;
    for (const c of k.coarse || []) c.visible = coarse;
  }
  group.userData.lodOn = !!on;
}
// called every frame: switches when the camera crosses the threshold (lodWanted, with its margin), not otherwise
export function assayLodTick(group, kept, metresPerPx) {
  const on = lodWanted(kept.lodSampleM, metresPerPx, !!group.userData.lodOn);
  if (on !== !!group.userData.lodOn) setAssayLod(group, kept, on);
}

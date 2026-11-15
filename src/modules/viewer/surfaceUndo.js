// TASKS.csv #3494 (#3437, #3082) — Undo / Redo for the model surfaces. The meshes live in ViewerModule (three.js objects and component state), so
// the undo history keeps only their IDS (store.jsx's undoSnapshot.surfaceIds); when an Undo / Redo changes that list, ViewerModule takes the
// surfaces that are no longer wanted out of the scene, keeping their entry and mesh in a small "grave", and puts back the ones that are wanted again
// from it. A surface the grave no longer holds (dropped to cap it) cannot come back: its id is left out. Pure logic here, the scene work there.
export const GRAVE_MAX = 12;

export const sameIds = (a, b) => a === b || (a?.length === b?.length && (a || []).every((v, i) => v === b[i]));

// have: the ids of the surfaces now; want: the ids the history asks for; grave: Map id -> { entry, mesh }
// -> { remove: [ids to take out], restore: [ids to bring back], order: the ids in the order `want` gives }
export function reconcileSurfaces(have, want, grave) {
  const h = new Set(have || []), w = new Set(want || []);
  const remove = (have || []).filter((id) => !w.has(id));
  const restore = (want || []).filter((id) => !h.has(id) && grave?.has(id));
  return { remove, restore, order: (want || []).filter((id) => h.has(id) || restore.includes(id)) };
}

// the surfaces in `list` ({ id }) re-ordered as `order` says (an id not in `order` keeps its place at the end)
export function inOrder(list, order) {
  const at = new Map((order || []).map((id, i) => [id, i]));
  return [...list].sort((a, b) => (at.has(a.id) ? at.get(a.id) : 1e9) - (at.has(b.id) ? at.get(b.id) : 1e9));
}

// put an item in the grave (newest last); past GRAVE_MAX the oldest is returned to be disposed
export function bury(grave, id, item, max = GRAVE_MAX) {
  grave.delete(id); grave.set(id, item);
  const dropped = [];
  while (grave.size > max) { const first = grave.keys().next().value; dropped.push(grave.get(first)); grave.delete(first); }
  return dropped;
}

// ---- the scene work (ViewerModule gives the refs) ---------------------------------------------------------------------------------------
import { useEffect, useRef } from "react";
import { dropDrawLod } from "../../lib/viewer/drawLod.js";

export function disposeItem(item) {
  const m = item?.mesh; if (!m) return;
  try { dropDrawLod(m); m.geometry?.dispose?.(); m.material?.dispose?.(); } catch { /* already gone */ }
}
// take a surface out of the scene, keeping its entry and mesh in the grave. -> true when a mesh was kept
export function stashSurface({ grave, meshes, group, surfaces }, id) {
  const mesh = meshes[id], entry = (surfaces || []).find((s) => s.id === id);
  if (mesh) { try { dropDrawLod(mesh); } catch { /* no LOD */ } group?.remove(mesh); delete meshes[id]; }
  if (!entry && !mesh) return false;
  for (const d of bury(grave, id, { entry, mesh })) disposeItem(d);
  return !!mesh;
}

// the two effects: the ids follow the surfaces (each add / remove its own undo step), and an Undo / Redo that changes the ids takes surfaces away / back
export function useSurfaceUndo({ implicitSurfaces, setImplicitSurfaces, implicitMeshesRef, implicitGroupRef, grave, hydrationRef, viewerUiStateSeq, surfaceIds, setSurfaceIds, undoCheckpoint }) {
  const now = useRef(implicitSurfaces); now.current = implicitSurfaces;
  const ids = useRef(surfaceIds); ids.current = surfaceIds;
  const ready = () => hydrationRef.current.seq === viewerUiStateSeq && !hydrationRef.current.pending;
  useEffect(() => { // surfaces -> ids
    if (!ready()) return;
    const have = implicitSurfaces.map((s) => s.id);
    if (sameIds(ids.current, have)) return;
    undoCheckpoint?.(); // the step before this one ends here: an add / remove is an undo step of its own
    setSurfaceIds(have);
  }, [implicitSurfaces]);
  useEffect(() => { // ids -> surfaces (an Undo / Redo)
    if (!ready()) return;
    const cur = now.current, have = cur.map((s) => s.id);
    const { remove, restore, order } = reconcileSurfaces(have, surfaceIds, grave.current);
    if (!remove.length && !restore.length) return;
    const ctx = { grave: grave.current, meshes: implicitMeshesRef.current, group: implicitGroupRef.current, surfaces: cur };
    const back = restore.map((id) => grave.current.get(id));
    restore.forEach((id) => grave.current.delete(id));
    remove.forEach((id) => stashSurface(ctx, id));
    for (const g of back) if (g?.mesh) { implicitGroupRef.current?.add(g.mesh); implicitMeshesRef.current[g.entry.id] = g.mesh; }
    const gone = new Set(remove);
    setImplicitSurfaces((p) => inOrder([...p.filter((s) => !gone.has(s.id)), ...back.filter((g) => g?.entry).map((g) => g.entry)], order));
  }, [surfaceIds]);
  useEffect(() => () => { for (const g of grave.current.values()) disposeItem(g); grave.current.clear(); }, [viewerUiStateSeq]); // another project: the grave goes
}

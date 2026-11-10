// TASKS.csv #2361 (review #2325, WA uranium) — the 3D View keeps its own list of custom layers (with their three.js groups) beside the
// store's plain copy. Closing a project, New, Open or a tab switch replaced the store's list, but the local one only ever GAINED the layers it
// lacked: the closed project's five layers stayed in the sidebar, and one edit on a stale row mirrored four of them (119,893 rows) into
// 'Untitled project'. On a project change (store.viewerUiStateSeq moved) the local list is rebuilt from the new project's store alone.

// the layers the local list should hold after a store change -> { keep: [local layers kept], drop: [local layers to detach], missing: [store
// layers to build] }. fresh: the project changed (nothing local is kept)
export function customLayerSync(local, store, fresh) {
  const storeIds = new Set((store || []).map((l) => l.id));
  const keep = fresh ? [] : (local || []);
  const drop = fresh ? (local || []) : [];
  const have = new Set(keep.map((l) => l.id));
  return { keep, drop, missing: (store || []).filter((l) => !have.has(l.id)), storeIds };
}

// the dropped layers' groups taken out of the scene and the group map (shared prototype geometries: detached, not disposed, as a removal)
export function detachCustomGroups(layers, groups) {
  for (const l of layers || []) {
    const g = groups[l.id];
    if (g) { g.parent?.remove(g); delete groups[l.id]; }
  }
}

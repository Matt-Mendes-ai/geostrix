// TASKS.csv #2361 (review #2325, WA uranium) — the 3D View keeps its own list of custom layers (with their three.js groups) beside the
// store's plain copy. Closing a project, New, Open or a tab switch replaced the store's list, but the local one only ever GAINED the layers it
// lacked: the closed project's five layers stayed in the sidebar, and one edit on a stale row mirrored four of them (119,893 rows) into
// 'Untitled project'. On a project change (store.viewerUiStateSeq moved) the local list is rebuilt from the new project's store alone.

// the layers the local list should hold after a store change -> { keep: [local layers kept], drop: [local layers to detach], missing: [store
// layers to build] }. fresh: the project changed (nothing local is kept). known: the ids the store held at the last sync (TASKS.csv #4018): a local layer
// the store HAD and no longer has was removed there (Redo of a removal, Undo of an import) and is dropped; one the store never had is an import still on
// its way to the store (the mirror effect writes it next), so it stays. Without `known` nothing is dropped inside a project.
export function customLayerSync(local, store, fresh, known = null) {
  const storeIds = new Set((store || []).map((l) => l.id));
  const gone = (l) => !!known && known.has(l.id) && !storeIds.has(l.id);
  const drop = fresh ? (local || []) : (local || []).filter(gone);
  const keep = fresh ? [] : (local || []).filter((l) => !gone(l));
  const have = new Set(keep.map((l) => l.id));
  return { keep, drop, missing: (store || []).filter((l) => !have.has(l.id)), storeIds };
}

// the list in the store's order (what Undo restores is where it was, not at the end); a layer the store does not have yet (a pending import) goes last, in its own order
export function arrangeLikeStore(list, store) {
  const at = new Map((store || []).map((l, i) => [l.id, i]));
  const rank = (l) => (at.has(l.id) ? at.get(l.id) : Infinity);
  const out = [...list].sort((a, b) => rank(a) - rank(b)); // a stable sort: the pending ones keep their order
  return out.every((l, i) => l === list[i]) ? list : out;
}

// the dropped layers' groups taken out of the scene and the group map (shared prototype geometries: detached, not disposed, as a removal)
export function detachCustomGroups(layers, groups) {
  for (const l of layers || []) {
    const g = groups[l.id];
    if (g) { g.parent?.remove(g); delete groups[l.id]; }
  }
}

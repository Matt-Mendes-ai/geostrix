// TASKS.csv #1286 — recolouring the legend, per-layer styles, the grid and the figure overlay never marked a project unsaved: viewerUiState is tracked
// as "view" so that orbiting never prompts, and the quit prompt and autosave then skipped all of that work. The camera is not in viewerUiState. Only the
// parts a geologist would lose count: layer visibility, filters and which holes are shown stay out, as before.
export const STYLING_FIELDS = ["legendOverride", "numericSymbology", "layerStyles", "assayStyle", "gridConfig", "bgColor", "holeLabelMode", "figureOverlay"];

export const stylingKey = (state) => (state ? JSON.stringify(STYLING_FIELDS.map((k) => state[k] ?? null)) : null);

// Tracks one project's styling. The first value after a project opens is its baseline; later different values are edits.
// TASKS.csv #1656 (review #1645, Copley) — rebase(state, seq): the 3D View says which value is its own reading of the opened project (with its
// defaults filled in). The baseline used to be whatever came first, and the view's first write after an open could differ from the file
// (holeLabelMode 'none' -> the file's 'hole_id'), so a project opened from a file showed 'unsaved changes' before anything was touched.
export function stylingTracker() {
  let seq = null, baseline = null;
  const track = (state, projectSeq) => {
    const key = stylingKey(state);
    if (key === null) return false;
    if (projectSeq !== seq || baseline === null) { seq = projectSeq; baseline = key; return false; }
    if (key === baseline) return false;
    baseline = key;
    return true;
  };
  track.rebase = (state, projectSeq) => { const key = stylingKey(state); if (key !== null) { seq = projectSeq; baseline = key; } };
  return track;
}

// #1656 — the 3D View's mirror of its custom layers into the store: the previous list when nothing changed (it rebuilt an identical list
// of new objects after every open, and the undo watcher, which compares by reference, counted that as an edit)
export function mirrorCustomLayers(prev, local) {
  const next = local.map(({ id, name, rows }) => ({ id, name, rows }));
  const p = prev || [];
  return p.length === next.length && next.every((l, i) => p[i] && p[i].id === l.id && p[i].name === l.name && p[i].rows === l.rows) ? prev : next;
}

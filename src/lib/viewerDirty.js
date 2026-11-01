// TASKS.csv #1286 — recolouring the legend, per-layer styles, the grid and the figure overlay never marked a project unsaved: viewerUiState is tracked
// as "view" so that orbiting never prompts, and the quit prompt and autosave then skipped all of that work. The camera is not in viewerUiState. Only the
// parts a geologist would lose count: layer visibility, filters and which holes are shown stay out, as before.
export const STYLING_FIELDS = ["legendOverride", "numericSymbology", "layerStyles", "assayStyle", "gridConfig", "bgColor", "holeLabelMode", "figureOverlay"];

export const stylingKey = (state) => (state ? JSON.stringify(STYLING_FIELDS.map((k) => state[k] ?? null)) : null);

// Tracks one project's styling. The first value after a project opens is its baseline; later different values are edits.
export function stylingTracker() {
  let seq = null, baseline = null;
  return (state, projectSeq) => {
    const key = stylingKey(state);
    if (key === null) return false;
    if (projectSeq !== seq || baseline === null) { seq = projectSeq; baseline = key; return false; }
    if (key === baseline) return false;
    baseline = key;
    return true;
  };
}

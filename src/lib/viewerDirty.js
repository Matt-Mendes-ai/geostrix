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
// TASKS.csv #2160 — and a layer's unit, its bin and its notes (a downhole log binned on import says so in the saved project too)
const KEEP = ["unit", "binM", "notes"];
// TASKS.csv #2952 / #2953 — a log layer's unit and valid range are set in Geophysics > Downhole logs on the STORE's copy; the 3D View's own copy
// never hears of them, so its next write here put its old unit back and dropped the range. For a layer the store already has, the store's
// value of these wins; a layer new to the store takes the 3D View's (the import's unit).
const STORE_WINS = ["unit", "validRange", "despikeM"]; // despikeM: #3116, set in Downhole logs as the range is
// TASKS.csv #3239 — and every other field the view does not set (a model-on-holes layer's sourceModel, #2558, fell off at the view's next
// write): the view's copy of a store layer is the snapshot it was built from ({ ...l, group }), so only the fields the view itself edits
// (VIEW_SETS) come from it; the rest is the store's copy, as it is now. A layer new to the store takes every field but the view's own.
const VIEW_SETS = ["name", "rows", ...KEEP.filter((k) => !STORE_WINS.includes(k))]; // name, rows, binM, notes
const VIEW_ONLY = new Set(["group"]); // the three.js group: never into the store (the project file)
const sameLayer = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
export function mirrorCustomLayers(prev, local) {
  const p = prev || [];
  const byId = new Map(p.map((x) => [x?.id, x]));
  const next = local.map((l) => {
    const old = byId.get(l.id);
    if (!old) { const o = {}; for (const k of Object.keys(l)) if (!VIEW_ONLY.has(k) && l[k] !== undefined) o[k] = l[k]; return o; }
    const o = { ...old, id: l.id };
    for (const k of VIEW_SETS) { if (l[k] != null) o[k] = l[k]; else if (k !== "name" && k !== "rows") delete o[k]; }
    return o;
  });
  return p.length === next.length && next.every((l, i) => p[i] && sameLayer(p[i], l)) ? prev : next;
}

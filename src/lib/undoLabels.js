// TASKS.csv #1087 (review #1016, onboarding) — what an undo / redo changed. undo() applies a whole snapshot of every
// undoable field (projectFields.js, track "undo") and said nothing, so Ctrl+Z on the 3D View could quietly revert an assay
// import or a Layout edit on another tab. The store compares the snapshot before and after (by reference, as #432's change
// test does) and the window names the kinds of data that changed.
import { t as tr } from "./i18n.js";

// field key -> a plain name for the user (several fields share one: assays + assayElements are "assays")
function labelOf(key) {
  switch (key) {
    case "collars": return tr("collars");
    case "survey": return tr("surveys");
    case "layers": return tr("interval logs");
    case "assays": case "assayElements": return tr("assays");
    case "customLayers": return tr("custom layers");
    case "boundaries": return tr("boundaries");
    case "modellingCodes": return tr("modelling codes");
    case "structuralTrends": return tr("structural trends");
    case "explicitSurfaces": return tr("explicit surfaces");
    case "omfObjects": return tr("OMF objects");
    case "layerGroups": return tr("layer groups");
    case "layoutPages": return tr("Layout pages");
    case "excludedIntercepts": case "softIntercepts": case "interceptSets": return tr("intercepts");
    case "sections": case "sectionGroups": return tr("sections");
    case "plannedHoles": return tr("planned holes");
    case "surfaceSamples": case "surfaceElements": return tr("surface samples");
    case "geochemThresholds": return tr("geochem thresholds");
    case "surfaceQc": return tr("surface QAQC");
    default: return key;
  }
}

// the keys whose value differs between two snapshots (reference comparison)
export function changedKeys(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter((k) => (a || {})[k] !== (b || {})[k]);
}

// "Undone: assays, Layout pages" / "Redone: ..." / nothing to undo
export function undoMessage(kind, keys) {
  if (keys == null) return kind === "undo" ? tr("Nothing to undo.") : tr("Nothing to redo.");
  const what = [...new Set(keys.map(labelOf))].join(", ");
  if (!what) return kind === "undo" ? tr("Undone (no data changed).") : tr("Redone (no data changed).");
  return kind === "undo" ? tr("Undone: {what}.", { what }) : tr("Redone: {what}.", { what });
}

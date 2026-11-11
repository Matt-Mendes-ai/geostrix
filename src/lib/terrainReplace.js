// TASKS.csv #2554 (review #2486, WA lithium) — the project holds one terrain and terrain is not undoable: the inversion's 'Ground from the
// stations' own elevations' replaced a 4.5 x 4 km collar terrain with a 2 x 2 km station grid and said 'Added the terrain'; the six
// rasters draped on the old one moved to the new one. Every builder that replaces the terrain asks first and says what it replaced.
import { t as tr } from "./i18n.js";

// the question (null when there is no terrain to replace)
export function replaceTerrainQuestion(current, name) {
  if (!current) return null;
  return tr("Replace the current terrain (\"{name}\") with \"{name2}\"? Only one terrain surface is supported at a time.", { name: current.name || tr("unnamed"), name2: name })
    + "\n\n" + tr("Terrain is not undoable: the old one is gone unless you import it again, and the rasters and map layers draped on it drape on the new one.");
}

// true when there is no terrain, or the user agreed to replace it
export function confirmReplaceTerrain(current, name, confirmFn = (q) => window.confirm(q)) {
  const q = replaceTerrainQuestion(current, name);
  return q == null || !!confirmFn(q);
}

// the sentence that opens the result note when a terrain was replaced ("" otherwise)
export function replacedTerrainNote(current) {
  return current ? tr("Replaced the terrain \"{name}\".", { name: current.name || tr("unnamed") }) + " " : "";
}

// TASKS.csv #2670 (#1731 follow-up, review #1645 Copley) — a score map (Targeting's fuzzy overlay / weights-of-evidence posterior, sent to
// the map as a raster) had no 3D legend entry: its colours run from 0 (pale) to params.displayRange[1] (dark red), a posterior stretched to
// its own highest value (#1731), but nothing on screen said so. Its ramp is now in the 3D legend. A raster with its own colour stops or a
// geology legend is rasterLegendGroups' (lib/legendGroups.js) and is skipped here.
// The stops and the tool test are copies of lib/evidence.js scoreImage / isOverlayOutput: evidence.js lives in the lazy Targeting chunk and
// would grow the startup bundle here. test/scoreRasterLegend2670 fails if the copies and the originals ever differ.
import { scaleLegendGroup } from "../legendGroups.js";

export const SCORE_RAMP = [[255, 255, 204], [254, 217, 118], [253, 141, 60], [227, 26, 28], [128, 0, 38]]; // = scoreImage's stops
export const isScoreRaster = (r) => /^(fuzzy overlay|weights of evidence)/.test(String(r?.params?.tool || "")); // = isOverlayOutput

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export function scoreRasterLegendGroups(rasters) {
  const groups = [];
  for (const r of rasters || []) {
    if (r.visible === false || r.colourStops?.length > 1 || r.legend?.units?.length || !isScoreRaster(r)) continue;
    const [lo, hi] = r.params?.displayRange || [0, 1];
    if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)) continue;
    // scoreImage maps v / top onto the ramp (top = displayRange[1]; the range starts at 0)
    const stops = SCORE_RAMP.map((c, i) => ({ value: lo + ((hi - lo) * i) / (SCORE_RAMP.length - 1), color: hex(c) }));
    groups.push(scaleLegendGroup(`score_${r.id}`, r.name, { colorMode: "continuous", stops }, lo, hi));
  }
  return groups;
}

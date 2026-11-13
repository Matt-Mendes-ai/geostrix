// TASKS.csv #3159 — idwColourFields, moved verbatim out of idw.js: the legends (legendGroups.js) need it at startup, and importing
// it from idw.js put the IDW gridding code in the startup bundle. idw.js imports and re-exports it.
import { VIRIDIS_ANCHORS } from "./layers.js";

// TASKS.csv #2845 (GSC review B12) — the colour fields the Maps card's bar and the Layout legend read (rasterColourFields' shape), for a
// grid drawn in viridis (magColorRGB) over a stretch's lo / hi. The IDW raster kept only gridMin / gridMax / stretch, so it had no colour bar
// and no legend row until its Ramp or Stretch was touched. Also read by rasterLegendGroups for an IDW grid saved before this.
// -> { colourStyle, colourRange, colourStops } or {} with no range
export function idwColourFields(stretch) {
  const lo = stretch?.lo, hi = stretch?.hi;
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)) return {};
  const n = VIRIDIS_ANCHORS.length - 1, hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const mode = ["p2-98", "linear", "equalise", "log"].includes(stretch.mode) ? stretch.mode : "p2-98";
  return { colourStyle: { palette: "viridis", stretch: mode, invert: false }, colourRange: [lo, hi],
    colourStops: VIRIDIS_ANCHORS.map((c, i) => ({ value: lo + (i / n) * (hi - lo), color: hex(c) })) };
}

// TASKS.csv #2776 (Matt's #2777 decision (a), side 2's steps) — the 3D View draws collar markers, hole traces and boundary lines OVER a flat
// raster (a georeferenced scan or a map floated a few metres above the collars), as the Maps plan does. three.js draws the opaque list first
// and the transparent list after it, sorted by renderOrder: the flat raster (transparent, no depth write) goes first in the transparent pass,
// then these, at full opacity (transparent: true, opacity 1: they look the same) with their depth test and depth write kept, so they still
// hide each other and the terrain still hides what is under it. Map layers keep 2 + their index (sceneBuilders); labels stay at 999.
export const DRAW_ORDER = { flatRaster: 1, traces: 5, collars: 6, lines: 7 };

// TASKS.csv #3159 — isAreaBoundary, moved verbatim out of boundaryImport.js (which re-exports it): the 3D view's Select by location
// list needs it at startup, and importing it from boundaryImport.js put the vector / CRS import code in the startup bundle.
// TASKS.csv #1466 (review #1352, Silvertip) — a boundary that can stand for an area: at least one ring of three points or more that is not
// flagged open. Contours, streams, survey lines and roads are open lines: the terrain / imagery area lists and Select by location skip them.
// A contour layer (contourLevels) is never an area, even where a level closes on itself.
export const isAreaBoundary = (b) => !(b?.contourLevels || []).length && (b?.polylines || []).some((l, i) => (l?.length || 0) >= 3 && b.closedFlags?.[i] !== false);

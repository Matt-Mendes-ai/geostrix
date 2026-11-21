// TASKS.csv #3961 (startup size) — the three print-scale figures the 3D View's capture needs (ViewerModule doCaptureViewportRender), out of
// lib/layoutGeometry.js so the rest of Layout's geometry loads with Layout; layoutGeometry.js re-exports them, unchanged. Page px are CSS px at
// 96 dpi.
export const M_PER_PAGE_PX = 0.0254 / 96;

// #398 — the orthographic half-height that puts N x the frame's printed width of ground across a frame elementW page px
// wide (ViewerModule's capture); the height follows from the frame's aspect
export const fixedScaleHalfHeight = (fixedScale, elementW, aspect) => (fixedScale * elementW * M_PER_PAGE_PX) / 2 / aspect;
// TASKS.csv #1486 — the other way: the 1:N a frame elementW page px wide shows when it holds 2 x halfH of world at this aspect (what the
// user's zoom framed in 'Enter & adjust view' while a fixed scale ignored it), and that N rounded to two significant figures
export const scaleForHalfHeight = (halfH, elementW, aspect) => (elementW > 0 && aspect > 0 ? (2 * halfH * aspect) / (elementW * M_PER_PAGE_PX) : null);

// TASKS.csv #1479 (review #1352) — the long side, in pixels, to render a Layout frame's capture at: 300 dpi of the frame's printed
// size (elementW / elementH in page px at 96 dpi), at least 600 px, at most `max`. Every capture used to be 3,000 px long, so a
// 60 x 40 mm overview frame was drawn at a pixel ratio of up to 13 (points and labels overdrawn) and froze the window for seconds.
// No frame size (a capture that is not for a Layout frame): `max`.
// TASKS.csv #2303 (Matt's option (b), 2026-11-09) — dpi: 200 for the captures shown on the page (44 % of the pixels: a shorter stall), 300
// for the print pass an export runs; 300 when not given, as before
export function captureLongPx(elementW, elementH, max = 3000, dpi = 300) {
  if (!(elementW > 0)) return max;
  const d = Number(dpi) > 0 ? Number(dpi) : 300;
  return Math.min(max, Math.max(600, Math.round((Math.max(elementW, elementH || 0) * d) / 96)));
}

// TASKS.csv #2044 / #1398 — how many legend rows the 3D view's figure overlay shows for a view of this size. Apart from components/ViewportFigureOverlay.jsx (12 kB) so the 3D view's toolbar can ask without the
// overlay's code being in the startup bundle; the component re-exports both names.
export const MAX_LEGEND_ITEMS = 14; // shared between the groups (#1398); 18 with the numeric ramps ran into the scale bar
// TASKS.csv #2044 (review #2013, Woodjam) — 14 rows whatever the view's size named 16 of 134 categories on a nine-layer project (two codes a
// layer). The start count now grows with the view's height (a row is ~17 px; the title, heading, ramps and scale bar keep ~160 px), and
// a wide view with more codes than one column holds gets a second column. #1534's fit still trims what runs into the scale bar.
// h, w: the overlay's size in px; total: the item rows wanted -> { cap, cols }
export function legendLayout(h, w, total = Infinity) {
  const one = h > 0 ? Math.max(MAX_LEGEND_ITEMS, Math.min(40, Math.floor((h - 160) / 17))) : MAX_LEGEND_ITEMS;
  const cols = w >= 1100 && total > one ? 2 : 1;
  return { cap: one * cols, cols };
}

// TASKS.csv #2200 / #2479 — Best intercepts 'To Layout' dropped a 60-row table at a fixed (60, 60) px: over the page title and scale bar,
// and 68 mm past the bottom of an A4 landscape sheet. The table now takes a free spot on the page with as many rows as fit there (the
// collar table's rule, #2135); the rest are counted on a closing row, and the CSV has them all.
import { placeCollarTable } from "./layoutPlace.js";

// elements: the page's elements; page: { w, h } in page px; total: the intercepts; noteRows: the room the caveat note takes, in rows.
// -> { x, y, shown (intercept rows on the sheet), more (left off it) }
export function interceptTablePlan(elements, page, { total, w = 560, fontPt = 7, noteRows = 4 } = {}) {
  const spot = placeCollarTable(elements, page, { w, fontPt, total: total + noteRows });
  const room = Math.max(5, spot.maxRows - noteRows);
  const shown = total <= room ? total : Math.max(1, room - 1); // a cut table gives one row to '... and N more'
  return { x: spot.x, y: spot.y, shown, more: total - shown };
}

// the line above the dialog's table (#2200): how many intercepts, in how many holes
export function interceptCount(results) {
  const holes = new Set((results || []).map((r) => r.hole_id));
  return { n: (results || []).length, holes: holes.size };
}

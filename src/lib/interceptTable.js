// TASKS.csv #2200 / #2479 — Best intercepts 'To Layout' dropped a 60-row table at a fixed (60, 60) px: over the page title and scale bar,
// and 68 mm past the bottom of an A4 landscape sheet. The table now takes a free spot on the page with as many rows as fit there (the
// collar table's rule, #2135); the rest are counted on a closing row, and the CSV has them all.
import { placeCollarTable, elementBox } from "./layoutPlace.js"; // elementBox: #3019

// elements: the page's elements; page: { w, h } in page px; total: the intercepts; noteRows: the room the caveat note takes, in rows.
// -> { x, y, shown (intercept rows on the sheet), more (left off it) }
// TASKS.csv #3019 — overlaps: the spot covers another element (no clear spot for even five rows: the caller starts a page of its own)
export function interceptTablePlan(elements, page, { total, w = 560, fontPt = 7, noteRows = 4 } = {}) {
  const spot = placeCollarTable(elements, page, { w, fontPt, total: total + noteRows });
  const room = Math.max(5, spot.maxRows - noteRows);
  const shown = total <= room ? total : Math.max(1, room - 1); // a cut table gives one row to '... and N more'
  const h = (shown + noteRows + 2) * fontPt * 1.9; // about the printed height (as the collar table's rows)
  const overlaps = (elements || []).map(elementBox).some((o) => spot.x < o.x + o.w && o.x < spot.x + w && spot.y < o.y + o.h && o.y < spot.y + h);
  return { x: spot.x, y: spot.y, shown, more: total - shown, overlaps };
}

// TASKS.csv #3019 (review #2876, WA iron) — a printed column showed '56.07', '59', '58.6', '60.7' (four significant figures each). One number
// of decimals for the whole column, from its largest value: `sig` significant figures there (Fe 60 -> 2 decimals, 1,708 -> 0, 0.25 g/t -> 3),
// between 0 and 4. -> (v) => text
export function columnFormat(values, sig = 4) {
  let max = 0;
  for (const v of values || []) { const a = Math.abs(Number(v)); if (Number.isFinite(a) && a > max) max = a; }
  const d = max > 0 ? Math.min(4, Math.max(0, sig - 1 - Math.floor(Math.log10(max)))) : 2;
  return (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Number(v).toFixed(d));
}

// the line above the dialog's table (#2200): how many intercepts, in how many holes
export function interceptCount(results) {
  const holes = new Set((results || []).map((r) => r.hole_id));
  return { n: (results || []).length, holes: holes.size };
}

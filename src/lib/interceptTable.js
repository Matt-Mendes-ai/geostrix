// TASKS.csv #2200 / #2479 — Best intercepts 'To Layout' dropped a 60-row table at a fixed (60, 60) px: over the page title and scale bar,
// and 68 mm past the bottom of an A4 landscape sheet. The table now takes a free spot on the page with as many rows as fit there (the
// collar table's rule, #2135); the rest are counted on a closing row, and the CSV has them all.
import { placeCollarTable, elementBox } from "./layoutPlace.js"; // elementBox: #3019
import { toFixedHalfUp } from "./numberFormat.js"; // TASKS.csv #3754 (9)

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
  return (v) => (v == null || !Number.isFinite(Number(v)) ? "" : toFixedHalfUp(v, d));
}

// TASKS.csv #3579 (Fireweed / Macpass rehearsal) — a grade column whose values run from 0.006 to 20 printed '0.006', '0.04867', '0.1', '0.2433' (four significant figures each); from its
// largest value alone (columnFormat) the small ones read 0.00. One number of decimals for the column from its low end: `sig` (2) significant figures of the 5th percentile of its positive
// values, between 0 and 4 decimals, so 0.006 reads 0.0060 and 20.1 reads 20.1234. -> (v) => text
export function spreadFormat(values, sig = 2) {
  const pos = (values || []).map(Number).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const q = pos.length ? pos[Math.floor(pos.length * 0.05)] : 0;
  const d = q > 0 ? Math.max(0, Math.min(4, sig - 1 - Math.floor(Math.log10(q)))) : 2;
  return (v) => (v == null || !Number.isFinite(Number(v)) ? "" : toFixedHalfUp(v, d));
}

// TASKS.csv #2708 (split from #2200 / #2479) — 'Continue on new pages': the intercepts the sheet's spot leaves out go on pages of their own
// (the collar table's continuation, #1638), each table as many rows as a fresh page holds (no caveat note: it is on the first table).
// first: the rows on the first table (plan.shown); total: all intercepts. -> [[from, to)] index ranges, one per continuation page
// TASKS.csv #3854 — elements: what a new page already carries (the data credit along its foot), planned around
export function continuationRanges(first, total, page, { w = 560, fontPt = 7, elements = [] } = {}) {
  const out = [];
  for (let from = first; from < total;) {
    const p = interceptTablePlan(elements, page, { total: total - from, w, fontPt, noteRows: 0 });
    const n = Math.max(1, p.more > 0 ? p.shown : total - from); // a cut table's last row says it carries on, as the first table's does
    out.push([from, from + n]);
    from += n;
  }
  // TASKS.csv #3866 — a last page of two rows on an empty sheet: when the last page holds only a few rows, the last two pages share their rows evenly (the earlier page held more than either half, so it fits)
  if (out.length >= 2) {
    const [pa, pb] = [out[out.length - 2], out[out.length - 1]], nb = pb[1] - pb[0], na = pa[1] - pa[0];
    if (nb < Math.min(5, Math.ceil(na / 3))) { const tot = na + nb, half = Math.ceil(tot / 2); out[out.length - 2] = [pa[0], pa[0] + half]; out[out.length - 1] = [pa[0] + half, pb[1]]; }
  }
  return out;
}

// the line above the dialog's table (#2200): how many intercepts, in how many holes
export function interceptCount(results) {
  const holes = new Set((results || []).map((r) => r.hole_id));
  return { n: (results || []).length, holes: holes.size };
}

// TASKS.csv #3565 (Fireweed / Macpass rehearsal) — the intercept table kept one order (grade x length, best first): a hole's 12 intervals sat at 12 places among 923 rows,
// and the CSV and the Layout table followed it. Sorted on a heading click: key 'hole' (then depth), 'from', 'to', 'length', 'grade', 'gl' (grade x length, the default),
// 'samples', or 'extra:<symbol>'; ties keep hole then depth, so the order is the same every time. -> a new array (the input is not changed); `stats` is carried over.
export function sortIntercepts(rows, key = "gl", desc = true, { gradeLength = (r) => (Number(r.avgGrade) || 0) * Math.max(0, (Number(r.length) || 0) - (Number(r.unsampledM) || 0)) } = {}) {
  const hole = (a, b) => String(a.hole_id).localeCompare(String(b.hole_id), undefined, { numeric: true, sensitivity: "base" });
  const depth = (a, b) => hole(a, b) || a.from - b.from || a.to - b.to;
  const num = (r) => {
    if (key === "from") return r.from; if (key === "to") return r.to; if (key === "length") return r.length; if (key === "grade") return r.avgGrade;
    if (key === "samples") return r.intervals; if (key === "gl") return gradeLength(r);
    if (key.startsWith("extra:")) { const v = r.extras?.[key.slice(6)]; return v == null ? null : Number(v); }
    return null;
  };
  const out = (rows || []).slice();
  if (key === "hole") out.sort((a, b) => (desc ? -1 : 1) * hole(a, b) || a.from - b.from || a.to - b.to);
  else out.sort((a, b) => {
    const x = num(a), y = num(b);
    if (x == null && y == null) return depth(a, b);
    if (x == null) return 1; // a blank last, whichever way it runs
    if (y == null) return -1;
    return (x === y ? 0 : desc ? y - x : x - y) || depth(a, b);
  });
  if (rows && rows.stats) out.stats = rows.stats;
  return out;
}

// TASKS.csv #3565 — the rows of the holes whose name contains the text (case does not matter); empty text keeps every row. -> the same array when nothing is filtered
export function filterIntercepts(rows, text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return rows;
  const out = (rows || []).filter((r) => String(r.hole_id).toLowerCase().includes(q));
  if (rows && rows.stats) out.stats = rows.stats;
  return out;
}

// TASKS.csv #1638 (review #1497, Lawyers) — the Layout collar table as an appendix: a first row, a hole filter, continuation
// pages, and a default length that fits the sheet. It listed rows 1-40 of 446 and said "add a second table", which listed the
// same 40 (no offset); 40 rows at its default place ran to page px 800 on a 794 px A4 landscape sheet.
import { printPx } from "./theme.js";

// sorted: the collars in table order. firstRow is 1-based; filter keeps holes whose id contains it (any case).
export function collarTableSlice(sorted, { firstRow = 1, maxRows = 40, filter = "" } = {}) {
  const f = String(filter || "").trim().toLowerCase();
  const list = f ? (sorted || []).filter((c) => String(c.hole_id ?? "").toLowerCase().includes(f)) : sorted || [];
  const lim = Math.max(1, Math.round(Number(maxRows) || 40));
  const start = Math.max(0, Math.min(list.length, Math.round(Number(firstRow) || 1) - 1));
  const rows = list.slice(start, start + lim);
  return { rows, total: list.length, start, end: start + rows.length, after: Math.max(0, list.length - start - rows.length) };
}

// One table row's height on the page (LayoutModule's cell: the font, 0.25 em padding top and bottom, a 1 px rule).
const rowPx = (fontPt) => { const fs = printPx(fontPt); return fs * 1.2 + 2 * Math.round(fs * 0.25) + 1; };

// How many collar rows fit between y and the bottom of a page (with the title, the header row, the closing line and a margin).
export function collarRowsThatFit(pageH, y, fontPt = 7) {
  const r = rowPx(fontPt), overhead = 2 * r + printPx(fontPt + 2) * 1.2 + 4 + 12 + 24;
  return Math.max(5, Math.floor((pageH - y - overhead) / r));
}

// The tables that carry on after `el` (same columns, filter and length), one per new page, at the top of the sheet.
export function continuationTables(el, total) {
  const lim = Math.max(1, Math.round(Number(el.maxRows) || 40));
  const out = [];
  for (let first = (Math.round(Number(el.firstRow) || 1)) + lim; first <= total; first += lim) {
    out.push({ ...el, id: `table_${Date.now()}_${out.length}`, firstRow: first, y: 40 });
  }
  return out;
}

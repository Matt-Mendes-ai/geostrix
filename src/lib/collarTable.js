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

// TASKS.csv #2718 — the page after `fromIndex` whose collar table starts at `nextRow` with the same hole filter (the continuation a
// 'Continue on new pages' made, or one the user set up), as an index into `pages`, or null. The printed table then says where it goes on.
export function continuationPageIndex(pages, fromIndex, el, nextRow) {
  const f = String(el?.holeFilter || "").trim();
  for (let i = fromIndex + 1; i < (pages || []).length; i++) {
    for (const e of pages[i]?.elements || []) {
      if (e?.type === "table" && e.source === "collars" && Math.round(Number(e.firstRow) || 1) === nextRow && String(e.holeFilter || "").trim() === f) return i;
    }
  }
  return null;
}

// One table row's height on the page (LayoutModule's cell: the font, 0.25 em padding top and bottom, a 1 px rule).
const rowPx = (fontPt) => { const fs = printPx(fontPt); return fs * 1.2 + 2 * Math.round(fs * 0.25) + 1; };

// How many collar rows fit between y and the bottom of a page (with the title, the header row, the closing line and a margin).
export function collarRowsThatFit(pageH, y, fontPt = 7) {
  const r = rowPx(fontPt), overhead = 2 * r + printPx(fontPt + 2) * 1.2 + 4 + 12 + 24;
  return Math.max(5, Math.floor((pageH - y - overhead) / r));
}
// TASKS.csv #2135 — the height a table of `rows` collar rows draws at (the fit above without its bottom margin), so it can be placed
export function collarTableHeight(rows, fontPt = 7) {
  const r = rowPx(fontPt);
  return Math.ceil(2 * r + printPx(fontPt + 2) * 1.2 + 4 + 12 + Math.max(1, rows) * r);
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

// TASKS.csv #1483 / #1771 / #2133 — the collars for the Layout collar table and atlas, with their orientation filled from the shallowest
// survey station where the collar record has none (flagged per value), and a collar azimuth that disagrees with that station by more
// than half a degree carried as azSurvey (moved here from LayoutModule.jsx to be testable).
export function collarsWithSurveyAttitude(collars, survey) {
  const first = new Map();
  for (const s of survey || []) { if (!Number.isFinite(s.depth)) continue; const f = first.get(s.hole_id); if (!f || s.depth < f.depth) first.set(s.hole_id, s); }
  // TASKS.csv #1771 (review #1645, Copley) — each value flagged by its own source: Copley's collars have a dip but no azimuth, and both
  // were starred 'from the survey' (COP-23-0005 printed the collar's -41 under that footnote, the gyro reads -46)
  // TASKS.csv #2133 (review #2013, Woodjam) — a collar azimuth that disagrees with the hole's shallowest survey station by more than half a
  // degree is flagged: Woodjam's collar sheet was true north (TF24-126: 200) imported as grid, the survey converted (198.74), and the
  // table printed 200 under 'Azimuth (grid)'. Which is right is not the table's to decide; it shows the collar's value and says so.
  const azOff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return (collars || []).map((c) => { const s = first.get(c.hole_id); if (!s) return c; const azS = !Number.isFinite(c.azimuth) && Number.isFinite(s.azimuth), dipS = !Number.isFinite(c.dip) && Number.isFinite(s.dip);
    const azDiffers = Number.isFinite(c.azimuth) && Number.isFinite(s.azimuth) && azOff(c.azimuth, s.azimuth) > 0.5 ? s.azimuth : null;
    return azS || dipS || azDiffers != null ? { ...c, azimuth: azS ? s.azimuth : c.azimuth, dip: dipS ? s.dip : c.dip, azFromSurvey: azS, dipFromSurvey: dipS, orientFromSurvey: azS || dipS, ...(azDiffers != null ? { azSurvey: azDiffers } : {}) } : c; });
}

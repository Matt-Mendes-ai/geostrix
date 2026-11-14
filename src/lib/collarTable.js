// TASKS.csv #1638 (review #1497, Lawyers) — the Layout collar table as an appendix: a first row, a hole filter, continuation
// pages, and a default length that fits the sheet. It listed rows 1-40 of 446 and said "add a second table", which listed the
// same 40 (no offset); 40 rows at its default place ran to page px 800 on a 794 px A4 landscape sheet.
import { elevationTrust, suspectElevationIds } from "./collarElevationTrust.js"; // TASKS.csv #3023 — #3004's shared rule
import { printPx } from "./theme.js";
import { collarAttrChoices, collarsWithPick } from "./holeFilter.js"; // TASKS.csv #2717; collarsWithPick: #3027

// sorted: the collars in table order. firstRow is 1-based; filter keeps holes whose id contains it (any case).
export function collarTableSlice(sorted, { firstRow = 1, maxRows = 40, filter = "" } = {}) {
  const f = String(filter || "").trim().toLowerCase();
  // TASKS.csv #3027 (review #2876, WA iron) — 'DrillholeType=DD' or 'hole type=Diamond (DD)' listed 0 holes (ids only): a filter with '=' is a
  // collar-field pick taken whole (holeFilter collarsWithPick, as the Atlas and the grade card read it: case and '_' for a space ignored)
  const list = !f ? sorted || [] : f.includes("=") ? collarsWithPick(sorted || [], String(filter).trim()) : (sorted || []).filter((c) => String(c.hole_id ?? "").toLowerCase().includes(f));
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

// TASKS.csv #2717 (split from #2480) — the collar fields a table can add as columns (hole type, a programme, a tenement: the categorical
// fields, 2-30 values, collarAttrChoices' rule), and the one a new table takes by default: the hole type when the project has one (every
// WAMEX collar table carries it). -> [key] / key or null
export function collarTableFieldChoices(collars) {
  return collarAttrChoices(collars).map((c) => c.key);
}
export function defaultCollarTableFields(collars) {
  const k = collarTableFieldChoices(collars).find((key) => /^hole[\s_-]?type$/i.test(String(key).trim()));
  return k ? [k] : [];
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

// TASKS.csv #2770 (split from #2717) — a long collar list in two table columns side by side, read down then across: the first half of a
// page's rows on the left, the rest on the right (half the pages for a 400-hole appendix). -> [rows] or [left, right]
export function splitTableRows(rows, parts = 1) {
  const list = rows || [];
  if (Math.round(Number(parts) || 1) !== 2 || list.length < 2) return [list];
  const k = Math.ceil(list.length / 2);
  return [list.slice(0, k), list.slice(k)];
}
// the rows down one table column: a split table's maxRows is shared by its two columns
export function tableColumnRows(el) {
  const lim = Math.max(1, Math.round(Number(el?.maxRows) || 40));
  return el?.split === 2 ? Math.ceil(lim / 2) : lim;
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

// TASKS.csv #3023 (review #2876, WA iron) — a collar table printed an elevation the import filled in (RHDMET_0145 '438.8', the project median)
// as if it were surveyed. #3004's rule (lib/collarElevationTrust.js) marks it: '438.8‡' for an elevation the import assumed (terrain,
// median or zero), '0.0§' for one in the file that is probably a missing value; one footnote line each, under the table.
const suspectCache = new WeakMap();
export function suspectIdsOf(collars) {
  const list = collars || [];
  let s = suspectCache.get(list);
  if (!s) suspectCache.set(list, (s = suspectElevationIds(list)));
  return s;
}
// -> the cell text: the elevation (1 decimal) with its mark, or "" with none
export function elevationCell(c, suspect) {
  const z = Number(c?.z);
  if (c?.z == null || c.z === "" || !Number.isFinite(z)) return "";
  const t = elevationTrust(c, suspect);
  return z.toFixed(1) + (t === "assumed" ? "‡" : t === "suspect" ? "§" : "");
}
// the footnote lines for the rows shown: [{ mark, kind, ids, how }] (how: the assumed fills by kind, e.g. { median: 2 })
export function elevationNotes(rows, suspect) {
  const assumed = rows.filter((c) => elevationTrust(c, suspect) === "assumed"), sus = rows.filter((c) => elevationTrust(c, suspect) === "suspect");
  const out = [];
  if (assumed.length) { const how = {}; for (const c of assumed) how[c.zAssumed] = (how[c.zAssumed] || 0) + 1; out.push({ mark: "‡", kind: "assumed", ids: assumed.map((c) => c.hole_id), how }); }
  if (sus.length) out.push({ mark: "§", kind: "suspect", ids: sus.map((c) => c.hole_id) });
  return out;
}

// TASKS.csv #3374 (review #3195) — 'Two table columns side by side' with two collar fields as columns ran its right half 86 mm off an A4
// sheet: each half was given 50 % of the frame and its cells do not wrap. The text is sized so the tables fit the frame's width: the
// widest text of each column (measure(text, px, bold) -> px; the headings bold), its cell padding (half the size a side) and the gap
// between halves. Down to minPx; below that it says it does not fit. -> { fs, shrunk, fits }
export function tableTextFit({ columns = [], parts = [], fsPx, widthPx, gap = 14, minPx = 0, measure }) {
  const need = (fs) => {
    const padX = Math.round(fs * 0.5);
    let total = gap * Math.max(0, parts.length - 1);
    for (const rows of parts) {
      columns.forEach((h, j) => {
        let m = measure(String(h ?? ""), fs, true);
        for (const r of rows) { const w = measure(String(r?.[j] ?? ""), fs, false); if (w > m) m = w; }
        total += m + 2 * padX;
      });
    }
    return total;
  };
  const n0 = need(fsPx);
  if (!(widthPx > 0) || n0 <= widthPx) return { fs: fsPx, shrunk: false, fits: true };
  let fs = Math.max(minPx, (fsPx * widthPx) / n0);
  for (let k = 0; k < 4 && fs > minPx; k++) { const n = need(fs); if (n <= widthPx) break; fs = Math.max(minPx, (fs * widthPx) / n); }
  return { fs, shrunk: true, fits: need(fs) <= widthPx + 0.5 };
}

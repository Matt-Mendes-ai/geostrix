// TASKS.csv #1484 (review #1352, Silvertip) — every view landed at (90, 90) and every insert at (100, 100), on top of what was already on the
// page: a section snapshot over the plan, its legend exactly over the plan's legend, its scale bar on the plan's bar. A new item now
// takes the free spot on the page that overlaps the least of what is there (top-left first on a tie), inside a margin.
// Pure: no DOM, no React. Boxes in page pixels { x, y, w, h }.
import { collarTableHeight, collarRowsThatFit } from "./collarTable.js"; // TASKS.csv #2135

// an element's box; a text, legend or bar that stores no height gets the size it usually draws at
const DEFAULT_SIZE = { text: [200, 40], legend: [220, 300], north: [60, 80], scale: [260, 50], logo: [160, 80], table: [320, 200] };
export function elementBox(el) {
  const d = DEFAULT_SIZE[el?.type] || [200, 100];
  const w = Number(el?.w) > 0 ? Number(el.w) : d[0];
  // #2135 — a collar table stores no height: it is as tall as its rows (a 40-row table was taken for 200 px)
  const tableH = el?.type === "table" && Number(el.maxRows) > 0 ? collarTableHeight(Number(el.maxRows), Number(el.fontPt) || 7) : null;
  const h = Number(el?.h) > 0 ? Number(el.h) : tableH ?? (el?.aspect > 0 ? w / el.aspect : d[1]);
  return { x: Number(el?.x) || 0, y: Number(el?.y) || 0, w, h };
}

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// the top-left corner for a w x h item on a page { w, h } holding `elements`
export function freeSpot(elements, w, h, page = { w: 1123, h: 794 }, { margin = 40, step = 20 } = {}) {
  const boxes = (elements || []).map(elementBox);
  const xMax = Math.max(margin, page.w - margin - w), yMax = Math.max(margin, page.h - margin - h);
  let best = null;
  for (let y = margin; y <= yMax; y += step) {
    for (let x = margin; x <= xMax; x += step) {
      const c = { x, y, w, h };
      let o = 0;
      for (const b of boxes) { o += overlap(c, b); if (best && o >= best.o) break; }
      if (!best || o < best.o) { best = { x, y, o }; if (o === 0) return { x, y }; }
    }
  }
  return best ? { x: best.x, y: best.y } : { x: margin, y: margin };
}

// TASKS.csv #2135 (review #2013, Layout) — a new collar table landed at (100, 100) over the legend and the scale bar. It now takes a
// free spot for as many of its rows as fit there (all of them, or as many as the sheet holds, down to 5; the rest go on continuation
// pages, #1638); with no free spot even for 5 rows, the least-covered spot for the full table. total: the collars it will list.
export function placeCollarTable(elements, page = { w: 1123, h: 794 }, { w = 520, fontPt = 7, total = 40, margin = 40 } = {}) {
  const boxes = (elements || []).map(elementBox);
  const clear = (b) => !boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  const want = Math.max(1, Math.min(total, collarRowsThatFit(page.h, margin, fontPt)));
  for (let rows = want; rows >= Math.min(5, want); rows--) {
    const h = collarTableHeight(rows, fontPt), spot = freeSpot(elements, w, h, page, { margin });
    if (clear({ ...spot, w, h }) && spot.y + h <= page.h - margin) return { ...spot, maxRows: rows };
  }
  const spot = freeSpot(elements, w, collarTableHeight(want, fontPt), page, { margin });
  return { ...spot, maxRows: Math.max(5, Math.min(want, collarRowsThatFit(page.h, spot.y, fontPt))) };
}

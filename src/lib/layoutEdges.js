// TASKS.csv #2482 (review #2325) — Export PDF prints every page but checked only the one on screen for elements past the sheet's edge
// (#1481): a page switched to portrait, or an atlas page, went to the PDF cut without a word. The other pages are not drawn, so they are
// checked from the elements' own boxes: an element whose size is known (a stored width and height, a frame's aspect, the north arrow's
// fixed glyph) by its whole box, any other (a text or a legend, sized by its content) only when it starts outside the sheet.
// TASKS.csv #2309 — and on the page on screen the check now takes the text inside an element too (offPageCount below).
import { elementBox } from "./layoutPlace.js";
import { DIAGRAM_W, DIAGRAM_H } from "./northDiagram.js";

const knownBox = (el) => {
  if (el?.type === "north") { const [w, h] = el.decl ? [DIAGRAM_W, DIAGRAM_H] : [54, 70]; return { x: Number(el.x) || 0, y: Number(el.y) || 0, w, h }; }
  if (Number(el?.w) > 0 && (Number(el?.h) > 0 || Number(el?.aspect) > 0)) return elementBox(el);
  return null;
};
const off = (b, page, tol = 1) => b.x < -tol || b.y < -tol || b.x + b.w > page.w + tol || b.y + b.h > page.h + tol;

// the elements of one page past its edge -> [{ id, type }]
export function offSheetElements(elements, page) {
  const out = [];
  for (const el of elements || []) {
    const b = knownBox(el);
    const past = b ? off(b, page) : (Number(el?.x) || 0) >= page.w || (Number(el?.y) || 0) >= page.h || (Number(el?.x) || 0) < 0 || (Number(el?.y) || 0) < 0;
    if (past) out.push({ id: el.id, type: el.type });
  }
  return out;
}

// every page but `skipId` (the one measured on screen) -> [{ index (1-based), name, items: [{ id, type }] }] for pages with any
export function offSheetPages(pages, skipId, sizeOf) {
  const out = [];
  (pages || []).forEach((pg, i) => {
    if (pg.id === skipId) return;
    const items = offSheetElements(pg.elements, sizeOf(pg));
    if (items.length) out.push({ index: i + 1, name: pg.name || `Page ${i + 1}`, items });
  });
  return out;
}

// the page on screen: an element counts when its box or any text inside it reaches past the sheet (#2309: an SVG's captions can run
// outside the element's own box). rects: [{ left, top, right, bottom }] for the element and its text; sheet likewise.
export function rectsPastSheet(rects, sheet, tol = 1) {
  return rects.some((b) => b && (b.right - b.left > 0 || b.bottom - b.top > 0) && (b.right > sheet.right + tol || b.bottom > sheet.bottom + tol || b.left < sheet.left - tol || b.top < sheet.top - tol));
}

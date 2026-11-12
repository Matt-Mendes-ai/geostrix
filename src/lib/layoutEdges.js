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
// TASKS.csv #2700 — which sides of the sheet a box crosses ("left", "top", "right", "bottom"), so the confirm can say where
const sides = (left, top, right, bottom, W, H, tol) => [left < -tol && "left", top < -tol && "top", right > W + tol && "right", bottom > H + tol && "bottom"].filter(Boolean);
// #2700 — a short name the user can find the element by: its label or its text, else "" (the confirm then gives its kind only)
export function elementCaption(el, max = 24) {
  const t = String(el?.label || el?.text || el?.title || "").replace(/\{\{?[^}]*\}\}?/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// the elements of one page past its edge -> [{ id, type, caption, sides }]
export function offSheetElements(elements, page, tol = 1) {
  const out = [];
  for (const el of elements || []) {
    const b = knownBox(el);
    const x = Number(el?.x) || 0, y = Number(el?.y) || 0;
    // sized by its content: only where it starts is known
    const past = b ? sides(b.x, b.y, b.x + b.w, b.y + b.h, page.w, page.h, tol) : [x < 0 && "left", y < 0 && "top", x >= page.w && "right", y >= page.h && "bottom"].filter(Boolean);
    if (past.length) out.push({ id: el.id, type: el.type, caption: elementCaption(el), sides: past });
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
  return rectSidesPast(rects, sheet, tol).length > 0;
}
// #2700 — the sides of the sheet any of the rects crosses, in the order left, top, right, bottom
export function rectSidesPast(rects, sheet, tol = 1) {
  const hit = new Set();
  for (const b of rects || []) {
    if (!b || !(b.right - b.left > 0 || b.bottom - b.top > 0)) continue;
    for (const sd of sides(b.left - sheet.left, b.top - sheet.top, b.right - sheet.left, b.bottom - sheet.top, sheet.right - sheet.left, sheet.bottom - sheet.top, tol)) hit.add(sd);
  }
  return ["left", "top", "right", "bottom"].filter((sd) => hit.has(sd));
}

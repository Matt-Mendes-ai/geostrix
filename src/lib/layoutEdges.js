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

// TASKS.csv #3028 (3) — a table sent from a tool (Best intercepts, source "static") is not a collar table: the kind the confirm names
export const elementKind = (el) => (el?.type === "table" && el?.source === "static" ? "statictable" : el?.type);
// TASKS.csv #3703 — an element that lies wholly outside its sheet (a title block left at x 1,252 px when a Tabloid page became A4):
// nothing of it can print. By its whole box where the size is known, else by where it starts (a content-sized element only grows
// right and down, so one starting at or past the right or bottom edge is outside). A turned element is never called outside (its
// box turns about its centre and may come back onto the sheet), nor is an arrow.
export function whollyOffSheet(el, page) {
  if (!el || el.type === "arrow" /* drawn from its tail at any angle: it can point back onto the sheet */ || (Number(el.rotation) || 0) % 360 !== 0) return false;
  const b = knownBox(el);
  const m = el.type === "north" ? 40 : 0; // #2309 — the diagram's GN / TN / MN captions run a little outside its box
  if (b) return b.x >= page.w + m || b.y >= page.h + m || b.x + b.w <= -m || b.y + b.h <= -m;
  return (Number(el.x) || 0) >= page.w || (Number(el.y) || 0) >= page.h;
}

// the elements of one page past its edge -> [{ id, type, caption, sides, out }]; out: wholly outside the sheet (#3703)
export function offSheetElements(elements, page, tol = 1) {
  const out = [];
  for (const el of elements || []) {
    const b = knownBox(el);
    const x = Number(el?.x) || 0, y = Number(el?.y) || 0;
    // sized by its content: only where it starts is known
    const past = b ? sides(b.x, b.y, b.x + b.w, b.y + b.h, page.w, page.h, tol) : [x < 0 && "left", y < 0 && "top", x >= page.w && "right", y >= page.h && "bottom"].filter(Boolean);
    if (past.length) out.push({ id: el.id, type: elementKind(el), caption: elementCaption(el), sides: past, out: whollyOffSheet(el, page) });
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
// #3703 — the page on screen: every one of the rects (the element and its text) lies outside the sheet, so none of it prints
export function rectsWhollyOff(rects, sheet) {
  const shown = (rects || []).filter((b) => b && (b.right - b.left > 0 || b.bottom - b.top > 0));
  return shown.length > 0 && shown.every((b) => b.left >= sheet.right || b.right <= sheet.left || b.top >= sheet.bottom || b.bottom <= sheet.top);
}

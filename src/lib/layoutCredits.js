// TASKS.csv #3591 (Fireweed rehearsal; more on #3527) — the data owner's credit prints on every page the app makes itself, without the user knowing the {credits} token: a section or strip-log
// 'Snapshot' page, a page a split or a table continues onto, an Atlas page, and the title block's own last row. Only when the project has a credit (a data credit, or a terrain / imagery
// licence line: lib/credits.js). Pure.
import { pagePx } from "./pageFormats.js";
import { CREDIT_TEXT, pagePrintsCredit, PAGE_MARGIN, textLines, creditLines, creditsElement, withCreditPages } from "./creditLine.js"; // TASKS.csv #3854 — the store's part, kept out of the startup bundle
export { pagePrintsCredit, PAGE_MARGIN, textLines, creditLines, creditsElement, withCreditPages };
import { elementBox } from "./layoutPlace.js"; // TASKS.csv #3707


// TASKS.csv #3707 — 'Fill the page' put a drill plan over the page's title, north arrow, scale bar, title block and credit, and the check above still passed because the credit existed (hidden under the plan). The elements that paint
// an opaque white box: one drawn LATER in the list (above) hides what lies under it.
const OPAQUE_TYPES = new Set(["viewport", "drillplan", "image", "titleblock", "legend", "table"]);
const overlapShare = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 && a.w > 0 && a.h > 0 ? (w * h) / (a.w * a.h) : 0; };
// the credit-carrying elements of a page that are shown: not (mostly) under an opaque element above them. A text's line is measured by its type (one line), a title block by its whole box (the Data row is its last row, its height is only estimated here)
export function visibleCreditCarriers(elements) {
  const els = elements || [], out = [];
  els.forEach((e, i) => {
    const text = e?.type === "text" && CREDIT_TEXT.test(String(e.text || "")), tb = e?.type === "titleblock" && (e.rows || []).some((r) => CREDIT_TEXT.test(String(r?.[1] || "")));
    if (!text && !tb) return;
    const b = text ? { x: Number(e.x) || 0, y: Number(e.y) || 0, w: Number(e.w) > 0 ? Number(e.w) : 200, h: Math.max(12, (Number(e.fontSize) || 11) * 1.4) } : elementBox(e);
    const hidden = els.slice(i + 1).some((o) => OPAQUE_TYPES.has(o?.type) && overlapShare(b, elementBox(o)) >= (text ? 0.6 : 0.8));
    if (!hidden) out.push(e);
  });
  return out;
}
// a page that has a credit element but none of them shown (all under an opaque element)
export const pageCreditHidden = (elements) => pagePrintsCredit(elements) && visibleCreditCarriers(elements).length === 0;

// the starter page's furniture laid out for a paper: the north arrow at the top right, the scale bar just above the credit, the credit along the foot -> { north: {x, y}, scale: {y}, credits: {x, y, w} }
export function starterLayout(format, text = "") {
  const { w } = pagePx(format), cr = creditsElement(format, text);
  return { north: { x: w - 123, y: 40 }, scale: { y: cr.y - 8 - 50 }, credits: { x: cr.x, y: cr.y, w: cr.w } };
}
// a page whose paper changed: the starter's north arrow, scale bar and credit that are still where the OLD paper put them move to where the new one does (one the user moved stays); -> elements
export function refitStarter(elements, oldFormat, newFormat, text = "", oldText = text) { // oldText: the credit the old layout was made for (a credit that arrived after the page)
  const was = starterLayout(oldFormat, oldText), now = starterLayout(newFormat, text), at = (a, b) => Math.abs(a - b) <= 1;
  // TASKS.csv #3702 — an element that would not move is returned AS IT IS (the same object): the caller tells 'nothing to do' by identity, and a new object for an unmoved north arrow made the Layout write a stale
  // element list back over a picture just added
  const moved = (el, to) => Object.keys(to).some((k) => !at(el[k], to[k]));
  return (elements || []).map((el) => {
    if (el?.id === "north" && el.type === "north" && at(el.x, was.north.x) && at(el.y, was.north.y)) return moved(el, now.north) ? { ...el, ...now.north } : el;
    if (el?.id === "scale" && el.type === "scale" && at(el.y, was.scale.y)) return moved(el, { y: now.scale.y }) ? { ...el, y: now.scale.y } : el;
    if (el?.id === "credits" && el.type === "text" && at(el.y, was.credits.y) && at(el.x, was.credits.x)) return moved(el, now.credits) ? { ...el, ...now.credits } : el;
    return el;
  });
}
// TASKS.csv #3702 — for a functional state update: the refitted list, or `elements` itself when nothing moves (so a setter given this as its updater leaves the state alone, and an element added in the same render survives)
export function refitStarterOf(elements, oldFormat, newFormat, text = "", oldText = text) {
  const next = refitStarter(elements, oldFormat, newFormat, text, oldText);
  return next.some((el, i) => el !== elements[i]) ? next : elements;
}


// TASKS.csv #3636 — before Export PDF / PNG: the pages (those that will be printed) that print no {credits} while the project has a data credit. `activeElements` are the open page's live elements
// (its stored copy lags); -> [name]
export function pagesWithoutCredit(pages, activeId, activeElements) {
  return (pages || []).filter((pg) => !pagePrintsCredit(pg.id === activeId ? activeElements : pg.elements)).map((pg, i) => pg.name || `Page ${i + 1}`);
}
// TASKS.csv #3707 — the pages whose credit is on the page but under an opaque element, so it prints without it -> [name]
export function pagesWithHiddenCredit(pages, activeId, activeElements) {
  return (pages || []).filter((pg) => pageCreditHidden(pg.id === activeId ? activeElements : pg.elements)).map((pg, i) => pg.name || `Page ${i + 1}`);
}

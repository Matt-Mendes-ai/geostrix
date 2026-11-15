// TASKS.csv #3591 (Fireweed rehearsal; more on #3527) — the data owner's credit prints on every page the app makes itself, without the user knowing the {credits} token: a section or strip-log
// 'Snapshot' page, a page a split or a table continues onto, an Atlas page, and the title block's own last row. Only when the project has a credit (a data credit, or a terrain / imagery
// licence line: lib/credits.js). Pure.
import { pagePx } from "./pageFormats.js";

const CREDIT_TEXT = /\{credits\}/;
// does a page already print the credit (a text box or a title block row with the token)?
export const pagePrintsCredit = (elements) => (elements || []).some((e) => (e?.type === "text" && CREDIT_TEXT.test(String(e.text || ""))) || (e?.type === "titleblock" && (e.rows || []).some((r) => CREDIT_TEXT.test(String(r?.[1] || "")))));

// TASKS.csv #3657 / #3658 (re-test R2) — the credit sat at A4's y 764 on every paper (through the scale bar on Letter, mid-page on Tabloid), its box was wider than a portrait sheet and began 30 px from the foot, so a
// wrapped second line printed 1.6 mm from the edge, inside a printer's unprintable margin. Now: a margin of 40 px (10.6 mm) round the page, the credit's box the page's width inside it, and its top where
// its own lines (estimated from the text, 11 px type) end at the margin.
export const PAGE_MARGIN = 40;
export const creditLines = (text, widthPx) => Math.max(1, Math.ceil((String(text || "").length * 5.9) / Math.max(120, widthPx)));
// the small {credits} text along the foot of a page of this paper; `text` is the credit as it prints (its length sets how many lines the box needs)
export function creditsElement(format, text = "") {
  const { w, h } = pagePx(format), cw = Math.max(200, w - 2 * PAGE_MARGIN);
  return { id: "credits", type: "text", x: PAGE_MARGIN, y: Math.max(PAGE_MARGIN, h - PAGE_MARGIN - creditLines(text, cw) * 15), w: cw, fontSize: 11, text: "{credits}" };
}
// the starter page's furniture laid out for a paper: the north arrow at the top right, the scale bar just above the credit, the credit along the foot -> { north: {x, y}, scale: {y}, credits: {x, y, w} }
export function starterLayout(format, text = "") {
  const { w } = pagePx(format), cr = creditsElement(format, text);
  return { north: { x: w - 123, y: 40 }, scale: { y: cr.y - 8 - 50 }, credits: { x: cr.x, y: cr.y, w: cr.w } };
}
// a page whose paper changed: the starter's north arrow, scale bar and credit that are still where the OLD paper put them move to where the new one does (one the user moved stays); -> elements
export function refitStarter(elements, oldFormat, newFormat, text = "", oldText = text) { // oldText: the credit the old layout was made for (a credit that arrived after the page)
  const was = starterLayout(oldFormat, oldText), now = starterLayout(newFormat, text), at = (a, b) => Math.abs(a - b) <= 1;
  return (elements || []).map((el) => {
    if (el?.id === "north" && el.type === "north" && at(el.x, was.north.x) && at(el.y, was.north.y)) return { ...el, ...now.north };
    if (el?.id === "scale" && el.type === "scale" && at(el.y, was.scale.y)) return { ...el, y: now.scale.y };
    if (el?.id === "credits" && el.type === "text" && at(el.y, was.credits.y) && at(el.x, was.credits.x)) return { ...el, ...now.credits };
    return el;
  });
}

// pages: [{ name, elements, format? }] -> the same, each page that does not print the credit given the {credits} text (when `hasCredit`); the input is not changed
export function withCreditPages(pages, hasCredit, defaultFormat = null) { // hasCredit: the credit's text (its length sizes the box) or true
  if (!hasCredit) return pages;
  return (pages || []).map((pg) => (pagePrintsCredit(pg.elements) ? pg : { ...pg, elements: [...(pg.elements || []), creditsElement(pg.format || defaultFormat, typeof hasCredit === "string" ? hasCredit : "")] }));
}

// TASKS.csv #3636 — before Export PDF / PNG: the pages (those that will be printed) that print no {credits} while the project has a data credit. `activeElements` are the open page's live elements
// (its stored copy lags); -> [name]
export function pagesWithoutCredit(pages, activeId, activeElements) {
  return (pages || []).filter((pg) => !pagePrintsCredit(pg.id === activeId ? activeElements : pg.elements)).map((pg, i) => pg.name || `Page ${i + 1}`);
}

// TASKS.csv #3854 — the part of the credit line the store needs to put it on every page added (pagePrintsCredit, creditsElement, withCreditPages), apart from
// lib/layoutCredits.js so that file (and what it imports) stays out of the startup bundle: the store is loaded at startup, Layout is not. layoutCredits.js
// re-exports all of it. Pure.
import { pagePx } from "./pageFormats.js";
import { layoutFontStack } from "./layoutFonts.js"; // TASKS.csv #3662

export const CREDIT_TEXT = /\{credits\}/;
// does a page already print the credit (a text box or a title block row with the token)?
export const pagePrintsCredit = (elements) => (elements || []).some((e) => (e?.type === "text" && CREDIT_TEXT.test(String(e.text || ""))) || (e?.type === "titleblock" && (e.rows || []).some((r) => CREDIT_TEXT.test(String(r?.[1] || "")))));

// TASKS.csv #3657 / #3658 (re-test R2) — the credit sat at A4's y 764 on every paper (through the scale bar on Letter, mid-page on Tabloid), its box was wider than a portrait sheet and began 30 px from the foot, so a
// wrapped second line printed 1.6 mm from the edge, inside a printer's unprintable margin. Now: a margin of 40 px (10.6 mm) round the page, the credit's box the page's width inside it, and its top where
// its own lines (estimated from the text, 11 px type) end at the margin.
export const PAGE_MARGIN = 40;
// TASKS.csv #3662 — the lines of the credit by MEASURING its words with canvas text in the figure's font (11 px, 4 % over for the print's own rounding), word-wrapped to the box; with no canvas (a test, a worker) the
// estimate of 5.9 px a letter as before. `measure` (text -> px) can be given.
let measureCtx;
const canvasMeasure = (px) => {
  try {
    if (measureCtx === undefined) measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    if (!measureCtx) return null;
    return (t) => { measureCtx.font = `${px}px ${layoutFontStack()}`; return measureCtx.measureText(t).width * 1.04; };
  } catch { measureCtx = null; return null; }
};
// the lines `text` takes in a box `widthPx` wide at `px` type: words measured and wrapped, or with no canvas the estimate (about 0.54 em a letter)
export function textLines(text, widthPx, px = 11, measure = canvasMeasure(px)) {
  const t = String(text || ""), width = Math.max(60, widthPx);
  if (!measure) return Math.max(1, Math.ceil((t.length * px * 0.5364) / width));
  let lines = 0;
  for (const para of t.split(/\r?\n/)) {
    let line = "", n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) { n++; line = word; } else line = next;
    }
    lines += n;
  }
  return Math.max(1, lines);
}
export const creditLines = (text, widthPx, measure) => textLines(text, Math.max(120, widthPx), 11, measure);

// the small {credits} text along the foot of a page of this paper; `text` is the credit as it prints (its length sets how many lines the box needs)
export function creditsElement(format, text = "", measure) {
  const { w, h } = pagePx(format), cw = Math.max(200, w - 2 * PAGE_MARGIN);
  return { id: "credits", type: "text", x: PAGE_MARGIN, y: Math.max(PAGE_MARGIN, h - PAGE_MARGIN - creditLines(text, cw, measure) * 15), w: cw, fontSize: 11, text: "{credits}" };
}

// pages: [{ name, elements, format? }] -> the same, each page that does not print the credit given the {credits} text (when `hasCredit`); the input is not changed
export function withCreditPages(pages, hasCredit, defaultFormat = null) { // hasCredit: the credit's text (its length sizes the box) or true
  if (!hasCredit) return pages;
  return (pages || []).map((pg) => (pagePrintsCredit(pg.elements) ? pg : { ...pg, elements: [...(pg.elements || []), creditsElement(pg.format || defaultFormat, typeof hasCredit === "string" ? hasCredit : "")] }));
}

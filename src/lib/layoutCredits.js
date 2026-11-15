// TASKS.csv #3591 (Fireweed rehearsal; more on #3527) — the data owner's credit prints on every page the app makes itself, without the user knowing the {credits} token: a section or strip-log
// 'Snapshot' page, a page a split or a table continues onto, an Atlas page, and the title block's own last row. Only when the project has a credit (a data credit, or a terrain / imagery
// licence line: lib/credits.js). Pure.
import { pagePx } from "./pageFormats.js";

const CREDIT_TEXT = /\{credits\}/;
// does a page already print the credit (a text box or a title block row with the token)?
export const pagePrintsCredit = (elements) => (elements || []).some((e) => (e?.type === "text" && CREDIT_TEXT.test(String(e.text || ""))) || (e?.type === "titleblock" && (e.rows || []).some((r) => CREDIT_TEXT.test(String(r?.[1] || "")))));

// the small {credits} text along the foot of a page of this paper
export function creditsElement(format) {
  const { w, h } = pagePx(format);
  return { id: "credits", type: "text", x: 40, y: Math.max(40, h - 30), w: Math.max(200, w - 80), fontSize: 11, text: "{credits}" };
}

// pages: [{ name, elements, format? }] -> the same, each page that does not print the credit given the {credits} text (when `hasCredit`); the input is not changed
export function withCreditPages(pages, hasCredit, defaultFormat = null) {
  if (!hasCredit) return pages;
  return (pages || []).map((pg) => (pagePrintsCredit(pg.elements) ? pg : { ...pg, elements: [...(pg.elements || []), creditsElement(pg.format || defaultFormat)] }));
}

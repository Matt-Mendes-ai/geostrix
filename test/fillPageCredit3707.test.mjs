// TASKS.csv #3707 — 'Fill the page' put the drill plan over the page's title, north arrow, scale bar, title block and credit, and the
// export's credit check passed because the credit element still existed, hidden under the plan. Now the button sends the plan to the
// back, and the check asks whether the credit is covered by an opaque element above it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageCreditHidden, visibleCreditCarriers, pagesWithHiddenCredit, pagesWithoutCredit } from "../src/lib/layoutCredits.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const furniture = () => [
  { id: "title", type: "text", x: 40, y: 30, w: 400, text: "Plan" },
  { id: "credits", type: "text", x: 40, y: 739, w: 1043, text: "{credits}", fontSize: 11 },
  { id: "tb", type: "titleblock", x: 1100, y: 800, w: 340, rows: [["Title", ""], ["Data", "{credits}"]] },
];
const fill = { id: "plan", type: "drillplan", x: 37.8, y: 37.8, w: 1556, h: 980 }; // 'Fill the page' on a Tabloid sheet

test("a plan filling the page over the credit hides it; behind the credit it does not", () => {
  assert.equal(pageCreditHidden([...furniture(), fill]), true);
  assert.equal(visibleCreditCarriers([...furniture(), fill]).length, 0);
  assert.equal(pageCreditHidden([fill, ...furniture()]), false); // sent to the back: all three carriers on top of it
  assert.equal(visibleCreditCarriers([fill, ...furniture()]).length, 2);
});

test("a small plan, or a page with no credit at all, is not 'hidden'", () => {
  assert.equal(pageCreditHidden([...furniture(), { id: "p", type: "drillplan", x: 40, y: 100, w: 500, h: 300 }]), false);
  assert.equal(pageCreditHidden([{ id: "title", type: "text", x: 40, y: 30, text: "Plan" }, fill]), false); // none to hide: pagesWithoutCredit's case
});

test("one visible carrier is enough (the credit text hidden, the title block's Data row shown)", () => {
  const tbOnly = [furniture()[1], fill, { id: "tb", type: "titleblock", x: 1100, y: 800, w: 340, rows: [["Data", "{credits}"]] }];
  assert.equal(pageCreditHidden(tbOnly), false);
});

test("the export check lists the pages by name, the open page from its live elements", () => {
  const pages = [{ id: "a", name: "Plan sheet", elements: [] }, { id: "b", name: "Other", elements: furniture() }];
  assert.deepEqual(pagesWithHiddenCredit(pages, "a", [...furniture(), fill]), ["Plan sheet"]);
  assert.deepEqual(pagesWithoutCredit(pages, "a", [...furniture(), fill]), []); // exists, so the old check passed: the bug
});

test("wired: Fill the page sends the plan to the back; the export asks about a hidden credit; keys in every language", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /updateSelected\(\{ x: 10 \* PX_PER_MM, y: 10 \* PX_PER_MM, w: A4\.w - 20 \* PX_PER_MM, h: A4\.h - 20 \* PX_PER_MM \}\); reorderSelected\("back"\);/);
  assert.match(l, /const hidden = pagesWithHiddenCredit\(toCheck, activeLayoutPageId, elements\);/);
  for (const k of [
    "The frame fills the page inside 10 mm margins, behind the title, north arrow, scale bar, title block and credit.",
    "Send the element over \"{page}\"'s data credit to the back (or move it) so the data owner is credited. Export without the credit?",
    "Send the elements over the data credit of {n} pages ({list}) to the back (or move them) so the data owner is credited. Export without the credit?",
  ]) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});

// TASKS.csv #3591 (Fireweed rehearsal, more on #3527) — the data credit prints on every page the app makes itself and on the default title block, without the user knowing the {credits} token.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withCreditPages, creditsElement, pagePrintsCredit } from "../src/lib/layoutCredits.js";
import { defaultTitleBlockRows, newTitleBlock, stockTemplateElements, STOCK_TEMPLATES } from "../src/lib/layoutTitleBlock.js";
import { pagePx } from "../src/lib/pageFormats.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("a page made by the app gets the {credits} text along its foot, sized to its own paper; a page that prints it already is left alone", () => {
  const a3 = { size: "a3", orientation: "portrait" }, { w, h } = pagePx(a3);
  const pages = [{ name: "Snapshot 2", elements: [{ id: "img1", type: "image" }], format: a3 }, { name: "has it", elements: [{ id: "t", type: "text", text: "Data: {credits}" }] }, { name: "blank" }];
  const out = withCreditPages(pages, true);
  const c = out[0].elements.find((e) => e.id === "credits");
  assert.equal(c.type, "text"); assert.equal(c.text, "{credits}"); assert.equal(c.x, 40); assert.equal(c.w, w - 80); assert.equal(c.y, h - 40 - 15, "one line, ending at the 40 px margin (#3658)");
  assert.equal(out[1].elements.length, 1, "already printed: not twice");
  assert.equal(out[2].elements.length, 1, "a page with no elements still gets it");
  assert.equal(pages[0].elements.length, 1, "the input is not changed");
  assert.equal(withCreditPages(pages, false), pages, "no credit in the project: the pages as they are");
});

test("the title block: a last 'Data' row = {credits} for a project with a credit; the default rows are as they were", () => {
  assert.equal(defaultTitleBlockRows().length, 11); assert.equal(defaultTitleBlockRows().some((r) => r[0] === "Data"), false);
  const rows = defaultTitleBlockRows({ credit: true });
  assert.deepEqual(rows[rows.length - 1], ["Data", "{credits}"]); assert.equal(rows.length, 12);
  assert.deepEqual(newTitleBlock("t", 1, 2, { credit: true }).rows, rows);
  assert.equal(pagePrintsCredit([newTitleBlock("t", 1, 2, { credit: true })]), true); assert.equal(pagePrintsCredit([newTitleBlock("t", 1, 2)]), false);
  for (const tpl of STOCK_TEMPLATES) {
    const els = stockTemplateElements(tpl, 1, { credit: true }), tb = els.find((e) => e.type === "titleblock");
    assert.equal(tb.rows[tb.rows.length - 1][0], "Data");
    const { h } = pagePx(tpl.format); assert.ok(tb.y + 12 * 19 + 4 <= h - 40, "the taller block still fits the sheet, inside the margin");
    assert.equal(stockTemplateElements(tpl, 1).find((e) => e.type === "titleblock").rows.length, 11);
  }
});

test("the starter page, the sheets the app makes and the title block are wired", () => {
  const m = read("../src/modules/LayoutModule.jsx");
  // #3854 — the credit goes on in the store's addLayoutPages, for every caller (test/layoutCreditStore3854.test.mjs)
  assert.match(read("../src/lib/store.jsx"), /const pages = withCreditPages\(rawPages, layoutCreditRef\.current \|\| false\);/);
  assert.match(m, /creditsRef\.current = credits; \/\/ #3591/);
  assert.match(m, /newTitleBlock\(id, tbSpot\.x, tbSpot\.y, \{ credit: !!credits, creditText: credits, shared: sharedTitleRows\(/); // shared: #3714
  assert.match(m, /stockTemplateElements\(tpl, Date\.now\(\), \{ credit: !!credits, creditText: credits(, shared: sharedTitleRows\(layoutPages\) \/\* #3714 \*\/)? \}\)/);
  assert.ok(creditsElement().id === "credits");
});

// TASKS.csv #3636 — a pre-export check: the pages about to print that carry no {credits} while the project has a credit
import { pagesWithoutCredit } from "../src/lib/layoutCredits.js";
test("#3636 pagesWithoutCredit names the pages (the open page by its live elements) and the export asks", async () => {
  const pages = [{ id: "a", name: "Plan", elements: [] }, { id: "b", name: "Section", elements: [{ type: "text", text: "{credits}" }] }, { id: "c", name: "Log", elements: [{ type: "titleblock", rows: [["Data", "{credits}"]] }] }];
  assert.deepEqual(pagesWithoutCredit(pages, "z", []), ["Plan"]);
  assert.deepEqual(pagesWithoutCredit(pages, "a", [{ type: "text", text: "Data: {credits}" }]), []);
  assert.deepEqual(pagesWithoutCredit(pages, "b", []), ["Plan", "Section"]);
  const src = (await import("node:fs")).readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /if \(creditsRef\.current\) \{\n\s+const toCheck = layoutPrintRequest\.kind === "png"/); assert.match(src, /pagesWithoutCredit\(toCheck, activeLayoutPageId, elements\)/);
});

// TASKS.csv #2312 — a page made from a starter template, switched to another paper size or orientation, lays the template out again
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STOCK_TEMPLATES, stockTemplateElements, refitStockTemplate } from "../src/lib/layoutTitleBlock.js";
import { pagePx } from "../src/lib/pageFormats.js";

const plan = STOCK_TEMPLATES.find((t) => t.kind === "plan");

test("A4 landscape -> A3 portrait: the neatline fills the new sheet, the title block and arrow move to its corners", () => {
  const els = stockTemplateElements(plan, 123);
  const edited = els.map((e) => (e.type === "text" ? { ...e, text: "Drill plan, Harry property" } : e));
  const other = { id: "viewport_1", type: "viewport", x: 50, y: 60, w: 700, h: 400 };
  const f = { size: "a3", orientation: "portrait" }, { w: W, h: H } = pagePx(f);
  const r = refitStockTemplate([...edited, other], f);
  assert.equal(r.refitted, 4);
  const rect = r.elements.find((e) => e.type === "rect"), tb = r.elements.find((e) => e.type === "titleblock"), n = r.elements.find((e) => e.type === "north");
  assert.ok(Math.abs(rect.x + rect.w + rect.x - W) < 1 && Math.abs(rect.y + rect.h + rect.y - H) < 1, "the neatline 10 mm in on every side");
  assert.ok(tb.x + tb.w < W && tb.y > H / 2, "the title block in the bottom-right");
  assert.ok(n.x > W / 2 && n.y < H / 4, "the arrow top-right");
  assert.equal(r.elements.find((e) => e.type === "text").text, "Drill plan, Harry property", "the title's text is kept");
  assert.deepEqual(r.elements.find((e) => e.id === "viewport_1"), other, "other elements stay");
});

test("a page not made from a starter template is left alone", () => {
  const els = [{ id: "text_9", type: "text", x: 10, y: 10 }];
  assert.deepEqual(refitStockTemplate(els, { size: "a3", orientation: "portrait" }), { elements: els, refitted: 0 });
});

test("wired into the paper size and orientation selects", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /onChange=\{\(e\) => changePageFormat\(\{ \.\.\.pageFormat, size: e\.target\.value \}\)/);
  assert.match(m, /onChange=\{\(e\) => changePageFormat\(\{ \.\.\.pageFormat, orientation: e\.target\.value \}\)/);
  assert.match(m, /const r = refitStockTemplate\(elements, f\);/);
});

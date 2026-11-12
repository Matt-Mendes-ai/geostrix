// TASKS.csv #2144 (review #2013, Woodjam) — Layout text had one typeface (Exo 2); a report figure usually needs the report's font
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAYOUT_FONTS, layoutFontStack, pageFont, withPageFont } from "../src/lib/layoutFonts.js";

test("layoutFontStack: a label's stack, Exo 2 for none or an unknown one", () => {
  assert.equal(layoutFontStack(undefined), "'Exo 2', system-ui, sans-serif");
  assert.equal(layoutFontStack("Wingdings"), "'Exo 2', system-ui, sans-serif");
  assert.equal(layoutFontStack("Times New Roman"), "'Times New Roman', Times, serif");
  assert.deepEqual(LAYOUT_FONTS.map((f) => f.label), ["Exo 2", "Arial", "Calibri", "Verdana", "Times New Roman", "Courier New"], "the section window's list");
});

test("pageFont: the typeface most text-bearing elements use; withPageFont sets them all", () => {
  const els = [{ type: "title", fontFamily: "Arial" }, { type: "text", fontFamily: "Arial" }, { type: "legend" }, { type: "viewport" }, { type: "image" }];
  assert.equal(pageFont(els), "Arial");
  assert.equal(pageFont([{ type: "viewport" }]), null);
  assert.equal(pageFont([{ type: "text" }]), "Exo 2");
  const all = withPageFont(els, "Calibri");
  assert.deepEqual(all.map((e) => e.fontFamily), ["Calibri", "Calibri", "Calibri", undefined, undefined]);
  const back = withPageFont(all, "Exo 2");
  assert.ok(back.every((e) => !("fontFamily" in e)), "Exo 2 clears the field");
  assert.equal(all[3], els[3], "other elements are left as they are");
});

test("wiring: every element's text uses its typeface; new ones take the page's; the sidebar control", () => {
  const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  const el = s.slice(s.indexOf("function LayoutElement({"), s.indexOf("function ColorRow("));
  assert.ok(!el.includes("'Exo 2', system-ui, sans-serif"), "no hard-coded Exo 2 left in LayoutElement");
  assert.match(el, /const FONT = layoutFontStack\(el\.fontFamily\);/);
  assert.match(el, /outlineOffset: 3, fontFamily: FONT \};/);
  assert.match(s, /if \(LAYOUT_FONT_TYPES\.has\(base\.type\)\) \{ const pf = pageFont\(elements\); if \(pf && pf !== LAYOUT_DEFAULT_FONT\) base\.fontFamily = pf; \}/);
  assert.match(s, /onClick=\{\(\) => setElements\(\(els\) => withPageFont\(els,/);
  const dp = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(dp, /const FONT = layoutFontStack\(el\?\.fontFamily\);/);
});

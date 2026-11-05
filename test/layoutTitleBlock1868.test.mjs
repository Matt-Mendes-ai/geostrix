// TASKS.csv #1868 — title block, starter templates, templates as files
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultTitleBlockRows, newTitleBlock, STOCK_TEMPLATES, stockTemplateElements, templateFile, parseTemplateFile } from "../src/lib/layoutTitleBlock.js";
import { pagePx } from "../src/lib/pageFormats.js";

test("a new title block: labelled rows, project facts from placeholders, nothing invented", () => {
  const rows = defaultTitleBlockRows();
  const by = Object.fromEntries(rows);
  assert.equal(by.Project, "{project}"); assert.equal(by.Date, "{date}"); assert.equal(by.Scale, "{scale}"); assert.equal(by["Datum / projection"], "{crs}");
  for (const k of ["Company", "Claims / tenures", "NTS / map sheet", "Figure", "Drawn by"]) assert.equal(by[k], "", `${k} is the geologist's to fill`);
  const tb = newTitleBlock("t1", 5, 6);
  assert.equal(tb.type, "titleblock"); assert.equal(tb.x, 5); assert.ok(tb.w > 0);
  rows[0][1] = "changed"; assert.equal(defaultTitleBlockRows()[0][1], "", "a fresh copy each time");
});

test("starter templates fit their paper: neatline, title, title block inside the page; north arrow on the plan only", () => {
  for (const t of STOCK_TEMPLATES) {
    const els = stockTemplateElements(t, 1), { w, h } = pagePx(t.format);
    const tb = els.find((e) => e.type === "titleblock");
    assert.ok(tb && tb.x > 0 && tb.x + tb.w < w && tb.y > 0 && tb.y < h, t.id);
    const rect = els.find((e) => e.type === "rect");
    assert.ok(rect.x > 0 && rect.x + rect.w < w && rect.y + rect.h < h, t.id);
    assert.equal(els.some((e) => e.type === "north"), t.kind === "plan", t.id);
    assert.equal(new Set(els.map((e) => e.id)).size, els.length, "unique ids");
  }
  assert.deepEqual(STOCK_TEMPLATES.map((t) => [t.format.size, t.format.orientation]), [["a4", "landscape"], ["a3", "landscape"]]);
});

test("a template file round-trips with its paper size", () => {
  const tpl = { name: "ARIS plan A4", format: { size: "a4", orientation: "portrait" }, elements: [newTitleBlock("tb", 1, 2), { id: "t", type: "text", x: 0, y: 0, text: "a\nb" }] };
  const back = parseTemplateFile(templateFile(tpl));
  assert.equal(back.name, "ARIS plan A4");
  assert.deepEqual(back.format, { size: "a4", orientation: "portrait" });
  assert.equal(back.elements.length, 2); assert.equal(back.elements[1].text, "a\nb"); assert.equal(back.dropped, 0);
});

test("an imported template cannot make the page fetch from the network, and unknown elements are left out", () => {
  const text = JSON.stringify({ geostrixLayoutTemplate: 1, name: "x", elements: [
    { id: "a", type: "logo", src: "https://example.com/track.png", w: 10 },
    { id: "b", type: "viewport", src: "http://example.com/a.png", w: 10, h: 10 },
    { id: "c", type: "logo", src: "data:image/png;base64,iVBORw0KGgo=", w: 10 },
    { id: "d", type: "script", text: "x" },
    { id: "e", type: "image", src: "data:image/svg+xml;base64,PHN2Zz4=" },
  ] });
  const r = parseTemplateFile(text);
  assert.deepEqual(r.elements.map((e) => e.id), ["b", "c"]);
  assert.equal(r.elements[0].src, undefined, "the viewport frame stays, its remote image does not");
  assert.equal(r.dropped, 3);
});

test("not a template", () => {
  assert.throws(() => parseTemplateFile("{nope"), /not JSON/);
  assert.throws(() => parseTemplateFile(JSON.stringify({ elements: [] })), /Not a GeoStrix layout template/);
});

test("the Layout wires the title block, multi-line text and template files", () => {
  const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.ok(s.includes('addElement("titleblock")'));
  assert.ok(s.includes('whiteSpace: "pre-wrap" /* #1868 */'));
  assert.ok(s.includes("askPrompt(tr(\"Template name?\")"));
  assert.ok(s.includes("addLayoutTemplate(name.trim(), elements, pageFormat)"));
  assert.ok(s.includes("parseTemplateFile(text"));
});

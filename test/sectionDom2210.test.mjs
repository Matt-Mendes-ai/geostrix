// TASKS.csv #2210 (review #2174, WA gold) — section intervals: one clipped group, no <title> per interval, the tooltip written on hover
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hoverTitle } from "../src/lib/svgLazyTitle.js";

// a minimal stand-in for an SVG element and the document
const fakeDoc = { created: 0, createElementNS(ns, tag) { this.created++; return { ns, tagName: tag, textContent: "", firstChild: null }; } };
const el = () => ({ tagName: "line", firstChild: null, insertBefore(t) { this.firstChild = t; } });

test("the first hover adds one <title>, later hovers reuse it and update its text", () => {
  const e = el(); fakeDoc.created = 0;
  const t1 = hoverTitle(e, "Lithology: SMP", fakeDoc);
  assert.equal(t1.tagName, "title"); assert.equal(t1.ns, "http://www.w3.org/2000/svg"); assert.equal(t1.textContent, "Lithology: SMP");
  const t2 = hoverTitle(e, "Lithology: SMP", fakeDoc);
  assert.equal(t2, t1); assert.equal(fakeDoc.created, 1);
  // React reused this line for another interval after a step: the label follows the row
  hoverTitle(e, "Alteration: Silica", fakeDoc);
  assert.equal(e.firstChild.textContent, "Alteration: Silica"); assert.equal(fakeDoc.created, 1);
  assert.equal(hoverTitle(e, undefined, fakeDoc), null);
  assert.equal(hoverTitle(null, "x", fakeDoc), null);
});

test("the section draws intervals in one clipped group without a title each", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  const i = s.indexOf("{intervals.map((row, i) => {"), block = s.slice(i, s.indexOf("</g>", i));
  assert.ok(i > 0);
  assert.doesNotMatch(block, /<title>/);
  assert.doesNotMatch(block, /<g key=\{i\} clipPath/);
  assert.match(block, /data-iv=\{i\}/);
  assert.match(s.slice(i - 600, i), /<g clipPath=\{`url\(#\$\{plotClipId\}\)`\} onMouseOver=\{\(e\) => \{ const k = e\.target\?\.dataset\?\.iv; if \(k != null\) hoverTitle\(e\.target, intervals\[Number\(k\)\]\?\.label\); \}\}>/);
});

test("a step or refresh says the section is being built until the new one arrives", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /const stepTo = \(msg\) => \{ (if \(vExag != null\) stepVE = \{ ve: vExag, at: Date\.now\(\) \}; )?setStepping\(true\); sendSectionContacts\(msg\); \};/);
  assert.match(s, /useEffect\(\(\) => \{ setStepping\(false\); \}, \[rawData\]\);/);
  for (const m of ["step: -1 })", "step: 1 })", 'step: -1, by: "buffer" })', 'step: 1, by: "buffer" })', "refresh: true })"]) assert.ok(s.includes(`onClick={() => stepTo({ id: data.id, ${m}}`), m);
  assert.doesNotMatch(s, /onClick=\{\(\) => sendSectionContacts\(\{ id: data\.id, (step|refresh)/);
  assert.match(s, /\{stepping && <span role="status"[^>]*>\{tr\("Building the section…"\)\}<\/span>\}/);
});

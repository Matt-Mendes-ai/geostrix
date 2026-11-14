// TASKS.csv #3304 (#3259's follow-up) — when 'Fit to window' shrinks a tall section's labels below ~7 px on screen, the window says so beside the
// checkbox (lower the VE, or untick to scroll). The size: 10 drawing units at the text size, times the drawn width over the viewBox width.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("measured from the drawn width over the viewBox's, again on a resize, only while fitting", () => {
  // the drawing's scale inside the element: the smaller of width and height ratios (fitted to the height, the drawing is narrower than the element)
  assert.match(src, /const measure = \(\) => \{ const vb = svg\.viewBox\?\.baseVal, r = svg\.getBoundingClientRect\(\), k = vb\?\.width && vb\.height && r\.width \? Math\.min\(r\.width \/ vb\.width, r\.height \/ vb\.height\) : 0; setFitTextPx\(k \? 10 \* textScale \* k : null\); \};/);
  assert.match(src, /if \(!fitWhole \|\| !svg \|\| typeof ResizeObserver === "undefined"\) \{ setFitTextPx\(null\); return undefined; \}/);
  assert.match(src, /const ro = new ResizeObserver\(measure\);\n\s+ro\.observe\(svg\);\n\s+return \(\) => ro\.disconnect\(\);\n\s+\}, \[fitWhole, textScale, vExag, data\]\);/);
  // declared after the state it reads (textScale, vExag): no use before its declaration
  assert.ok(src.indexOf("const [fitTextPx, setFitTextPx]") > src.indexOf("const [textScale, setTextScaleState]"));
  assert.ok(src.indexOf("const [fitTextPx, setFitTextPx]") > src.indexOf("const [vExag, setVExag]"));
});

test("the note beside the box, under 7 px only", () => {
  assert.match(src, /\{fitWhole && fitTextPx != null && fitTextPx < 7 && <span role="note"[^>]*>\{tr\("Text under 7 px: lower the VE, or untick to scroll"\)\}<\/span>\}/);
  // the review's case: a 1,037 x 3,009 drawing fitted into ~460 px of height is drawn ~159 px wide: 10 x 159 / 1,037 = 1.5 px
  const px = (vbW, drawnW, scale = 1) => (10 * scale * drawnW) / vbW;
  assert.ok(px(1037, 1037 * (460 / 3009)) < 7);
  assert.ok(px(1037, 1037) >= 7, "full width: 10 px");
});

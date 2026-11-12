// TASKS.csv #2604 (review #2486) — 'Re-snapshot with the text at print size' wrecked a section's labels: the window laid the figure out
// for Layout's frame (textFactor = PLACED_W / frame width, ~0.6 at 1 : 1,000 on A3), then exportSvgMarkup raised every text to the print
// floor of the DEFAULT placement (PLACED_W), larger than the layout was made for, so hole ids overprinted, the caption lines overlapped
// and a value label ran off the edge. The floor now follows the placement the caller gives (placedW).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportSvgMarkup } from "../src/lib/svgExport.js";
import { printPt, printPx, PLACED_W } from "../src/lib/theme.js";

// a minimal DOM: an 1,100-unit figure with two texts at 9 and 14 px
function fakeSvg(sizes) {
  const mkText = (px) => ({ px, style: { fontSize: "" } });
  const live = sizes.map(mkText);
  const node = (texts) => ({
    attrs: {}, style: { removeProperty() {} }, texts,
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    querySelectorAll(sel) { return sel === "text" ? this.texts : []; },
    insertBefore() {}, appendChild() {},
    ownerDocument: { createElementNS: () => ({ setAttribute() {} }) },
  });
  const svg = node(live);
  svg.viewBox = { baseVal: { x: 0, y: 0, width: 1100, height: 700 } };
  svg.cloneNode = () => { const c = node(sizes.map(mkText)); svg.lastClone = c; return c; };
  return svg;
}

test("the print floor follows the placement it is given; the default placement is unchanged", () => {
  globalThis.window = { getComputedStyle: (t) => ({ fontSize: `${t.px}px` }) };
  globalThis.XMLSerializer = class { serializeToString() { return "<svg/>"; } };
  try {
    const floorAt = (placedW) => printPx(printPt.caption) * (1100 / placedW);
    // default: as before (text under PLACED_W's floor raised to it)
    const a = fakeSvg([9, 14]); exportSvgMarkup(a);
    const fa = floorAt(PLACED_W);
    assert.equal(a.lastClone.texts[0].style.fontSize, fa > 9 ? `${+fa.toFixed(2)}px` : "");
    // Layout's A3 frame at 1 : 1,000 (~1,138 page px): the floor is lower, so 9 px text laid out for that frame is left alone
    const b = fakeSvg([9, 14]); exportSvgMarkup(b, { placedW: 1138 });
    const fb = floorAt(1138);
    assert.ok(fb < 9 + 1e-9 || b.lastClone.texts[0].style.fontSize === `${+fb.toFixed(2)}px`);
    if (fa > 9) assert.notEqual(b.lastClone.texts[0].style.fontSize, a.lastClone.texts[0].style.fontSize, "the frame's floor, not PLACED_W's");
    assert.equal(b.lastClone.texts[1].style.fontSize, "", "text above the floor is never touched");
  } finally { delete globalThis.window; delete globalThis.XMLSerializer; }
});

test("the section window's Layout snapshot passes the frame it is laid out for (PLACED_W / textFactor)", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /exportSvgMarkup\(svgEl, \{ placedW: PLACED_W \/ \(Number\(textFactor\) > 0 \? Number\(textFactor\) : 1\) \}\)/);
  // and atPrintSize scales the label size by the same factor
  assert.match(s, /\(\(printPx\(printPt\.caption\) \* \(SECTION_W \/ PLACED_W\)\) \/ 9\) \* \(Number\(textFactor\) > 0 \? Number\(textFactor\) : 1\)/);
});

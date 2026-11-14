// TASKS.csv #3383 — small Layout slips: the GN / TN / MN diagram clear of the frame it grew over, 'Turn the frame' offering the page too,
// the title block's placeholder list, A2 / A1 / A0 paper (and their PDF size names), a title named in the pre-flight
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGE_FORMATS, pagePx, pdfOptions } from "../src/lib/pageFormats.js";
import { freeSpot, elementBox } from "../src/lib/layoutPlace.js";
import { keepOnSheet, DIAGRAM_W, DIAGRAM_H } from "../src/lib/northDiagram.js";

test("(7) A2, A1 and A0, and the PDF export takes their names", () => {
  assert.deepEqual(["a2", "a1", "a0"].map((k) => PAGE_FORMATS[k].mm), [[594, 420], [841, 594], [1189, 841]]);
  assert.deepEqual(pagePx({ size: "a1", orientation: "landscape" }), { w: Math.round(841 * 96 / 25.4), h: Math.round(594 * 96 / 25.4) });
  assert.deepEqual(pdfOptions({ size: "a0", orientation: "portrait" }), { pageSize: "A0", landscape: false });
  const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  for (const n of ["A0", "A1", "A2"]) assert.match(main, new RegExp(`const PDF_PAGE_SIZES = new Set\\(\\[[^\\]]*"${n}"`));
});

test("(1) the diagram's box in place would cover the map frame: a free spot at its size does not", () => {
  // SYNTHETIC A4 landscape page: a map frame under the arrow's corner
  const page = { w: 1123, h: 794 }, frame = { id: "vp", type: "viewport", x: 40, y: 120, w: 760, h: 600 }, arrow = { id: "n", type: "north", x: 700, y: 60 };
  const kept = keepOnSheet(arrow.x, arrow.y, page.w, page.h);
  const b = elementBox(frame), over = Math.min(kept.x + DIAGRAM_W, b.x + b.w) - Math.max(kept.x, b.x) > 4 && Math.min(kept.y + DIAGRAM_H, b.y + b.h) - Math.max(kept.y, b.y) > 4;
  assert.ok(over, "in place it covers the frame");
  const spot = freeSpot([frame], DIAGRAM_W, DIAGRAM_H, page);
  const o2 = Math.min(spot.x + DIAGRAM_W, b.x + b.w) - Math.max(spot.x, b.x) > 4 && Math.min(spot.y + DIAGRAM_H, b.y + b.h) - Math.max(spot.y, b.y) > 4;
  assert.ok(!o2, `the free spot ${spot.x}, ${spot.y} is clear`);
});

test("wired: the diagram's placement, the page turn, the placeholder list, a title's name", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /\.\.\.\(covers \? freeSpot\(others, DIAGRAM_W, DIAGRAM_H, A4\) : kept\)/);
  assert.match(m, /tr\("Turned, it runs off this page: turn the page as well\."\)/);
  assert.match(m, /changePageFormat\(\{ \.\.\.pageFormat, orientation: pageFormat\.orientation === "landscape" \? "portrait" : "landscape" \}\)/);
  assert.match(m, /Values can use \{project\}, \{date\}, \{page\}, \{pages\}, \{pagename\}, \{scale\}, \{crs\}, \{credits\}, \{north\} and \{convergence\}/);
  assert.match(m, /const ELEMENT_KIND_NAMES = \{ title: "Title"/);
});

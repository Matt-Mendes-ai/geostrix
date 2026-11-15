// TASKS.csv #3418 (#3383 (11)) — a new viewport frame is sized to, and placed on, the active page's own paper (it took an A4-landscape size and
// spot whatever the paper: a portrait A4 or an A3 page got a frame placed as if 1123 x 794). SYNTHETIC papers.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { viewportFrameOnPaper, freeSpot } from "../src/lib/layoutPlace.js";
import { pagePx } from "../src/lib/pageFormats.js";

test("A4 landscape is as before: 700 px wide at 16:9, inside the margins", () => {
  const paper = pagePx({ size: "a4", orientation: "landscape" });
  assert.deepEqual(paper, { w: 1123, h: 794 });
  assert.deepEqual(viewportFrameOnPaper(paper, 16 / 9), { w: 700, h: 394 });
});

test("a portrait paper: narrower than the sheet, and tall frames are held to the paper's height", () => {
  const paper = pagePx({ size: "a4", orientation: "portrait" });
  assert.deepEqual(paper, { w: 794, h: 1123 });
  const f = viewportFrameOnPaper(paper, 16 / 9);
  assert.equal(f.w, 634, "the sheet's width less the 160 px margins");
  assert.ok(f.w <= paper.w - 160 && f.h <= paper.h - 80);
  const tall = viewportFrameOnPaper(pagePx({ size: "a4", orientation: "landscape" }), 0.5); // a 1:2 portrait capture on a landscape page
  assert.ok(tall.h <= 794 - 80, `${tall.h} fits the paper's height`);
  assert.equal(tall.w, Math.round(tall.h * 0.5), "its aspect is kept");
});

test("a larger paper does not stretch it past 700 px; nonsense in gives a 16:9 frame", () => {
  assert.equal(viewportFrameOnPaper(pagePx({ size: "a3", orientation: "landscape" }), 16 / 9).w, 700);
  assert.deepEqual(viewportFrameOnPaper(null, 0), viewportFrameOnPaper({ w: 1123, h: 794 }, 16 / 9));
});

test("the spot is found on the paper, clear of what is there", () => {
  const paper = pagePx({ size: "a4", orientation: "portrait" }), { w, h } = viewportFrameOnPaper(paper, 16 / 9);
  const els = [{ id: "a", type: "rect", x: 40, y: 40, w: 634, h: 400 }];
  const s = freeSpot(els, w, h, paper);
  assert.ok(s.y >= 440 - 1 || s.x >= 674, `${JSON.stringify(s)} clears the rectangle`);
  assert.ok(s.x + w <= paper.w && s.y + h <= paper.h, "and stays on the paper");
});

test("wired in the store: the active page's paper, the sized frame, the spot on that paper", () => {
  const s = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const paper = pagePx\(pageFormatOf\(layoutPages\.find\(\(p\) => p\.id === activeLayoutPageId\)\)\);\n\s*const \{ w, h \} = viewportFrameOnPaper\(paper, aspect\);/);
  assert.match(s, /mkView\(freeSpot\(els, w, h, paper\)\)/);
  assert.match(s, /import \{ freeSpot, viewportFrameOnPaper/);
});

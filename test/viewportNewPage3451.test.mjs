// TASKS.csv #3451 (#3418) — a new viewport frame with no free spot on its page's paper goes on a new page of the same paper. SYNTHETIC page.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { freeSpot, spotIsFree, viewportFrameOnPaper } from "../src/lib/layoutPlace.js";
import { pagePx } from "../src/lib/pageFormats.js";
const paper = pagePx({ size: "a4", orientation: "landscape" }), { w, h } = viewportFrameOnPaper(paper, 16 / 9);
test("a page with room says so; a page covered edge to edge does not", () => {
  const room = [{ id: "a", type: "rect", x: 40, y: 40, w: 200, h: 100 }];
  assert.equal(spotIsFree(room, freeSpot(room, w, h, paper), w, h), true);
  const full = [{ id: "f", type: "rect", x: 0, y: 0, w: paper.w, h: paper.h }];
  assert.equal(spotIsFree(full, freeSpot(full, w, h, paper), w, h), false);
  assert.equal(spotIsFree([], { x: 40, y: 40 }, w, h), true);
});
test("wired in the store: not free -> a page of the same paper holds the view, and it becomes the active page", () => {
  const s = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(s.includes("if (layoutElements.length > 0 && !spotIsFree(layoutElements, here, w, h)) {"));
  assert.ok(s.includes("elements: addViewportToPage([], mkView(freeSpot([], w, h, paper))), ...(fmt ? { format: fmt } : {})"));
  assert.ok(s.includes("setActiveLayoutPageId(pageId);") && s.includes("} else setLayoutElements((els) => addViewportToPage(els, mkView(freeSpot(els, w, h, paper))));"));
});

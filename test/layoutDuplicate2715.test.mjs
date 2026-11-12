// TASKS.csv #2715 — Duplicate (and paste on the same page) at the sheet's right / bottom edge steps the copy back onto the page
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { copyOffset } from "../src/lib/layoutPlace.js";

const A4L = { w: 1123, h: 794 }, off = 19;

test("in the middle of the sheet the copy goes 5 mm right and down", () => {
  assert.deepEqual(copyOffset([{ type: "rect", x: 100, y: 100, w: 200, h: 100 }], A4L, off), { dx: 19, dy: 19 });
});

test("at the right edge it goes left, at the bottom edge up", () => {
  assert.deepEqual(copyOffset([{ type: "rect", x: 900, y: 100, w: 220, h: 100 }], A4L, off), { dx: -19, dy: 19 });
  assert.deepEqual(copyOffset([{ type: "rect", x: 100, y: 690, w: 200, h: 100 }], A4L, off), { dx: 19, dy: -19 });
});

test("a whole-sheet element has no room either way and stays in place on that side", () => {
  assert.deepEqual(copyOffset([{ type: "rect", x: 0, y: 0, w: 1123, h: 794 }], A4L, off), { dx: 0, dy: 0 });
});

test("a selection moves as one: the group's box decides", () => {
  const els = [{ type: "rect", x: 100, y: 100, w: 50, h: 50 }, { type: "rect", x: 1050, y: 100, w: 60, h: 50 }];
  assert.deepEqual(copyOffset(els, A4L, off), { dx: -19, dy: 19 });
});

test("wired into Duplicate and paste", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const \{ dx, dy \} = copyOffset\(src, A4, Math\.round\(5 \* PX_PER_MM\)\);/);
  assert.match(m, /layoutClipboard\.pageId === activeLayoutPageId \? copyOffset\(layoutClipboard\.els, A4, Math\.round\(5 \* PX_PER_MM\)\)/);
});

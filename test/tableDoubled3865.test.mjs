// TASKS.csv #3865 (Scottie Gold review) — 'Two table columns side by side' doubled the collar table's frame at the same x: the table at x = 116 mm ended 94 mm off an A4 landscape sheet, over the
// north arrow and onto the credit. Synthetic landscape starter page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_LAYOUT_ELEMENTS } from "../src/lib/projectFields.js";
import { refitStarter } from "../src/lib/layoutCredits.js";
import { pagePx } from "../src/lib/pageFormats.js";
import { growInPlace, elementBox, spotIsFree } from "../src/lib/layoutPlace.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const landscape = { size: "a4", orientation: "landscape" }, page = pagePx(landscape);
const starter = () => refitStarter(DEFAULT_LAYOUT_ELEMENTS.map((e) => ({ ...e })), landscape, landscape, "");

test("the doubled frame is moved left to the margin; it never ends past the sheet's right margin", () => {
  const table = { id: "t", type: "table", x: 440, y: 140, w: 520, h: 420 }; // 116 mm from the left, as the app placed it
  const others = starter();
  const newW = Math.min(page.w - 80, 1040);
  const at = growInPlace(others, elementBox(table), newW, page);
  assert.ok(at.x + newW <= page.w - 40 + 1e-9, `${at.x} + ${newW}`);
  assert.equal(at.x, page.w - 40 - newW, "right edge on the margin, left of where it stood");
  assert.ok(spotIsFree(others, at, newW, 420), "and clear of the title, arrow, bar and credit");
});

test("with something in the way, the page's free spot; a table already inside the margin stays put", () => {
  const others = [...starter(), { id: "img", type: "image", x: 40, y: 140, w: 300, h: 420 }];
  const at = growInPlace(others, { x: 440, y: 140, w: 520, h: 420 }, 700, page);
  assert.ok(at.x + 700 <= page.w - 40 + 1e-9);
  const small = growInPlace(starter(), { x: 60, y: 140, w: 400, h: 300 }, 600, page);
  assert.deepEqual(small, { x: 60, y: 140 });
});

test("wiring: ticking the box moves the frame as well as widening it", () => {
  assert.match(read("../src/modules/LayoutModule.jsx"), /\.\.\.growInPlace\(elements\.filter\(\(x\) => x\.id !== sel\.id\), elementBox\(sel\), Math\.min\(A4\.w - 80, w \* 2\), A4\)/);
});

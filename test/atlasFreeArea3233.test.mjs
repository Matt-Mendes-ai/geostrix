// TASKS.csv #3233 (split from #2674) — an atlas page's strip log takes the template's largest free area when it is tall enough there, instead
// of the fixed side column that narrowed the template around it (#1772)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./helpers/viteUrlLoader.mjs", import.meta.url);
const { placeStripLog, freeStripLogBox, FREE_SHARE } = await import("../src/lib/atlas.js");

const page = { w: 1123, h: 794 };
const meet = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

test("a template with a free block in the middle: the log goes there, touching nothing", () => {
  // map on the left, legend and title block on the right, a free band between them
  const template = [
    { id: "map", type: "viewport", x: 40, y: 40, w: 560, h: 714 },
    { id: "leg", type: "legend", x: 900, y: 40, w: 183, h: 400 },
    { id: "tb", type: "text", x: 900, y: 600, w: 183, h: 154 },
  ];
  const b = placeStripLog(template, 0.35, page);
  assert.equal(b.free, true);
  assert.ok(b.x >= 612 - 1e-9 && b.x + b.w <= 888 + 1e-9, JSON.stringify(b));
  assert.ok(Math.abs(b.h - 714) < 1e-6, "the full height between the margins");
  assert.ok(template.every((e) => !meet(e, b)));
});

test("a template that leaves no tall enough area keeps the column (and #1772 makes room)", () => {
  const full = [{ id: "vp", type: "viewport", x: 40, y: 50, w: 971, h: 700 }, { id: "t", type: "text", x: 40, y: 12, w: 1043, h: 28 }];
  const free = freeStripLogBox(full, 0.22, page);
  assert.ok(!free || free.h < FREE_SHARE * 714, JSON.stringify(free));
  const b = placeStripLog(full, 0.22, page);
  assert.equal(b.free, false);
  assert.equal(b.y, 40);
});

test("the free area clears each element by the gap, stays inside the margins, and is capped at 40 % of the width", () => {
  const els = [{ x: 40, y: 40, w: 300, h: 300 }];
  const b = freeStripLogBox(els, 3, page);
  assert.ok(b.w <= page.w * 0.4 + 1e-9);
  assert.ok(b.x >= 40 && b.y >= 40 && b.x + b.w <= page.w - 40 + 1e-9 && b.y + b.h <= page.h - 40 + 1e-9);
  const grown = { x: 40 - 12, y: 40 - 12, w: 324, h: 324 };
  assert.ok(!meet(grown, b));
  assert.equal(freeStripLogBox(els, 0, page), null);
});

test("wiring: a log in a free area moves nothing and is saved without the flag", () => {
  const s = readFileSync(new URL("../src/lib/atlas.js", import.meta.url), "utf8");
  assert.match(s, /const \{ free, \.\.\.box \} = placeStripLog\(elements, built\.aspect, page \|\| undefined\);/);
  assert.match(s, /if \(!free\) \(\{ elements, narrowed, overlapping \} = makeRoomForStripLog\(/);
});

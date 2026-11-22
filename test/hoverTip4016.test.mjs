// TASKS.csv #4016 — the 3D view's hover pop-up cuts a long logged description and stays inside the window.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { clipTipText, clipTipLine, placeTip, TIP_LINE_CHARS, TIP_MAX_LINES } from "../src/lib/tipText.js";

const words = (n) => Array.from({ length: n }, (_, i) => `word${i % 17}`).join(" ");

test("#4016 a long description line is cut at a word boundary with an ellipsis; short lines are left alone", () => {
  const long = words(300); // ~1,800 characters, as a logged paragraph
  const out = clipTipLine(long);
  assert.ok(out.length <= TIP_LINE_CHARS + 1, `${out.length} characters`);
  assert.ok(out.endsWith("…"));
  assert.ok(long.startsWith(out.slice(0, -1)), "cut, not rewritten");
  assert.match(out, /word\d+…$/, "ends on a whole word");
  assert.equal(clipTipLine("Lithology: V4"), "Lithology: V4");
  const tip = ["HOLE-1", "Lithology: X", "336.8–409.45 m", long].join("\n");
  const c = clipTipText(tip).split("\n");
  assert.deepEqual(c.slice(0, 3), ["HOLE-1", "Lithology: X", "336.8–409.45 m"], "the hole, the value and the depths are kept whole");
  assert.ok(c[3].endsWith("…"));
});

test("#4016 a tip with many lines keeps the first ones and ends with an ellipsis line", () => {
  const many = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
  const c = clipTipText(many).split("\n");
  assert.equal(c.length, TIP_MAX_LINES);
  assert.equal(c[0], "line 0");
  assert.equal(c.at(-1), "…");
  assert.equal(clipTipText("a\nb"), "a\nb");
  assert.equal(clipTipText(null), "");
});

test("#4016 placement: below-right of the pointer, flipped above near the bottom, never above the window's top or past its bottom", () => {
  assert.deepEqual(placeTip(100, 100, 200, 80, 1920, 1080), { left: 114, top: 114 });
  const nearBottom = placeTip(100, 1000, 200, 80, 1920, 1080);
  assert.equal(nearBottom.top, 1000 - 80 - 8);
  const nearRight = placeTip(1900, 100, 200, 80, 1920, 1080);
  assert.equal(nearRight.left, 1920 - 200 - 8);
  const tall = placeTip(1500, 300, 360, 900, 1920, 1080); // a 900 px box with the pointer high up: starts low enough to fit
  assert.ok(tall.top >= 4 && tall.top + 900 <= 1080, JSON.stringify(tall));
});

test("#4016 the 3D view's tooltip uses the clip and the placement, at the wider width", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const text = clipTipText\(t\.text\);/);
  assert.match(v, /const \{ left, top \} = placeTip\(t\.x, t\.y, w, h, innerWidth, innerHeight\);/);
  assert.match(v, /maxWidth: 360 \/\* #4016/);
});

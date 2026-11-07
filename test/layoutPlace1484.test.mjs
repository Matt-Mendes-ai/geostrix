// TASKS.csv #1484 — every view landed at (90, 90) and every insert at (100, 100) on top of what was there; no Ctrl+C / Ctrl+V
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freeSpot, elementBox } from "../src/lib/layoutPlace.js";

const page = { w: 1123, h: 794 };
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("a new item takes free space; with none, the least-covered spot", () => {
  const plan = { id: "vp", type: "viewport", x: 90, y: 90, w: 700, h: 394 };
  const a = freeSpot([plan], 300, 200, page);
  assert.ok(!overlaps({ ...a, w: 300, h: 200 }, elementBox(plan)), JSON.stringify(a));
  const legend = { id: "lg", type: "legend", x: a.x, y: a.y }; // no stored size: the legend's usual one
  const b = freeSpot([plan, legend], 300, 200, page);
  assert.ok(![plan, legend].some((e) => overlaps({ ...b, w: 300, h: 200 }, elementBox(e))), JSON.stringify(b));
  // a full page: still a spot, inside the margin
  const full = { type: "viewport", x: 0, y: 0, w: 1123, h: 794 };
  const c = freeSpot([full], 300, 200, page);
  assert.ok(c.x >= 40 && c.y >= 40 && c.x + 300 <= 1123 - 40 + 1);
  assert.deepEqual(elementBox({ type: "image", x: 1, y: 2, w: 200, aspect: 2 }), { x: 1, y: 2, w: 200, h: 100 });
});

test("snapshots, views, inserts and logos use it; Ctrl+C / Ctrl+V copy between pages", () => {
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(L, /const spot = freeSpot\(placedSoFar, w, h, A4\); placedSoFar\.push\(\{ \.\.\.spot, w, h \}\);/);
  assert.ok(!/x: 90 \+ stagger/.test(L) && !/x: 100, y: 100, src: reader\.result/.test(L));
  assert.match(L, /if \(type === "text" \|\| type === "north"\) Object\.assign\(base, freeSpot\(/);
  assert.match(L, /\(e\.key === "c" \|\| e\.key === "C"\)\) \{ if \(copySelected\(\)\) e\.preventDefault\(\); return; \}/);
  assert.match(L, /\(e\.key === "v" \|\| e\.key === "V"\)\) \{ if \(pasteClipboard\(\)\) e\.preventDefault\(\); return; \}/);
  assert.match(L, /^let layoutClipboard = null;$/m);
  const S = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(S, /\.\.\.freeSpot\(els, w, h\) \/\* #1484/);
});

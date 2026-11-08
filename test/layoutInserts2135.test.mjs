// TASKS.csv #2135 (review #2013, Layout) — Insert > Collar table, an unbound Insert > Scale bar and Views > Drill plan go into the page's
// free space like the other inserts (#1484 / #1640); they landed at (100, 100) and (60, 80), on the legend, the views and each other.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeCollarTable, elementBox, freeSpot } from "../src/lib/layoutPlace.js";
import { collarTableHeight, collarRowsThatFit } from "../src/lib/collarTable.js";
const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const A4 = { w: 1123, h: 794 };
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// the reviewer's page 1: a text box, a legend at (440, 80) and a free scale bar at (100, 100)
const page = [
  { id: "t", type: "text", x: 40, y: 40, w: 200 },
  { id: "lg", type: "legend", x: 440, y: 80, w: 220, h: 300 },
  { id: "sb", type: "scale", x: 100, y: 100 },
];

test("a collar table takes free space, with as many rows as fit there", () => {
  const t = placeCollarTable(page, A4, { w: 520, fontPt: 7, total: 544 });
  const box = elementBox({ type: "table", w: 520, fontPt: 7, ...t });
  for (const el of page) assert.ok(!hit(box, elementBox(el)), `${el.id} ${JSON.stringify(box)}`);
  assert.ok(box.y + box.h <= A4.h - 20, JSON.stringify(box));
  assert.ok(t.maxRows >= 5 && t.maxRows <= collarRowsThatFit(A4.h, t.y, 7));
});
test("a short table asks only for its rows; a stored table is as tall as its rows", () => {
  const t = placeCollarTable([], A4, { total: 12 });
  assert.equal(t.maxRows, 12);
  assert.deepEqual([t.x, t.y], [40, 40]);
  assert.equal(elementBox({ type: "table", x: 0, y: 0, w: 520, maxRows: 40, fontPt: 7 }).h, collarTableHeight(40, 7));
  assert.ok(collarTableHeight(40, 7) > 400); // was taken for 200 px
});
test("the drill plan and an unbound scale bar use freeSpot; a bound bar stays under its view", () => {
  assert.match(m, /if \(!base\.boundTo\) Object\.assign\(base, freeSpot\(elements, 260, 50, A4\)\); \/\* #2135 \*\//);
  assert.match(m, /Object\.assign\(base, freeSpot\(elements, base\.w, base\.h, A4\)\); \/\/ #2135/);
  // with the page above, a free bar no longer lands on the existing one
  const s = freeSpot(page, 260, 50, A4);
  assert.ok(!hit({ ...s, w: 260, h: 50 }, elementBox(page[2])));
});

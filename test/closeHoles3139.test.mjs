// TASKS.csv #3139 (#3022, WA iron review) — a section through 41 holes 25 m apart: each Fe bar ran across several neighbouring holes and the
// twelve-character hole names stacked six tiers deep over the data. The bars now end within half the typical gap between collars, and a
// crowded collar name stays above its collar or is left out (counted), never flipped down into the data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarGapPx, gradeBarMax, collarLabelsCrowded, placeLabels, labelWidth } from "../src/lib/sectionLabels.js";

test("the typical collar gap: the 25th percentile of the gaps over 1 px; none for one hole or a fan from one pad", () => {
  assert.equal(collarGapPx([0, 20, 40, 60, 80, 400]), 20, "a far-off hole does not set it");
  assert.equal(collarGapPx([100]), null);
  assert.equal(collarGapPx([50, 50.5, 50.2]), null, "a fan from one pad");
  assert.equal(collarGapPx([0, NaN, 30, 60]), 30);
});

test("the longest bar ends within half the gap, one length for the section; wide spacing keeps 36 px", () => {
  assert.equal(gradeBarMax(null, 10, 1), 36);
  assert.equal(gradeBarMax(400, 10, 1), 36);
  const m = gradeBarMax(100, 10, 1); // 100/2 - 10 - 5 = 35 room, less the 8 px gap -> 27
  assert.equal(m, 27);
  assert.ok(10 + 5 + m + 8 <= 100 / 2, "inside half the gap");
  assert.equal(gradeBarMax(100, 10, 2), 9, "two elements share the room");
  assert.equal(gradeBarMax(25, 10, 1), 4, "never below 4 px");
});

test("crowded names: wider than the gap; placed above their collar only, the rest left out", () => {
  const ids = Array.from({ length: 41 }, (_, i) => `RHRC0578${String(i).padStart(4, "0")}`);
  const fs9 = 9, gap = 10, w = labelWidth(ids[0], fs9);
  assert.ok(collarLabelsCrowded(gap, ids.map((t) => labelWidth(t, fs9))));
  assert.ok(!collarLabelsCrowded(w + 10, ids.map((t) => labelWidth(t, fs9))));
  // collars along a flat top 60 px below the drawing's edge, the data below them
  const items = ids.map((t, i) => ({ key: t, text: t, ax: 80 + i * gap, ay: 60, dir: -1 }));
  const yBounds = [2, 600];
  const free = placeLabels(items.map((it) => ({ ...it })), { fontSize: fs9, bounds: [4, 500], yBounds, dropCrowded: true });
  const held = placeLabels(items.map((it) => ({ ...it, noFlip: true })), { fontSize: fs9, bounds: [4, 500], yBounds, dropCrowded: true });
  assert.ok(free.some((b) => b.y > 60), "before: some names went below the collars, into the data");
  assert.ok(held.every((b) => b.y <= 60), "now: every name is above its collar");
  assert.ok(held.length < items.length && held.length > 0, `thinned: ${held.length} of ${items.length}`);
});

test("wiring: SectionWindow uses the gap for the bars and the crowding for the names", () => {
  const s = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /const BAR_MAX = gradeBarMax\(collarGap, ribbonReach,/);
  assert.match(s, /if \(collarLabelsCrowded\(collarGap, items\.filter\(\(it\) => it\.dir < 0\)\.map\(\(it\) => labelWidth\(it\.text, fs\(9\)\)\)\)\) items\.forEach\(\(it\) => \{ if \(it\.dir < 0\) it\.noFlip = true; \}\);/);
});

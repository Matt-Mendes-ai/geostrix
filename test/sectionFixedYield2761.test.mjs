// TASKS.csv #2761 (#2604 follow-up) — a dragged section label kept its offset at any text size; in the print-size pass (larger text) two
// dragged labels could overprint. With fixedYield a dragged label that no longer fits is placed like the others.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeLabels } from "../src/lib/sectionLabels.js";

const items = [
  { key: "A|collar", text: "DH001", ax: 100, ay: 100, dir: -1 },
  { key: "B|collar", text: "DH002", ax: 130, ay: 100, dir: -1 },
];
// dragged so they sat side by side at 9 px; at 18 px text they overlap
const fixed = { "A|collar": { dx: 0, dy: -20 }, "B|collar": { dx: 20, dy: -20 } };
const overlap = (a, b) => a.x - a.w / 2 < b.x + b.w / 2 && b.x - b.w / 2 < a.x + a.w / 2 && a.y - a.h < b.y && b.y - b.h < a.y;

test("without fixedYield the dragged labels overprint at a larger text size (the window's own behaviour)", () => {
  const p = placeLabels(items, { fontSize: 18, fixed, bounds: [0, 1000] });
  assert.ok(overlap(p[0], p[1]));
});

test("with fixedYield the first keeps its spot and the second is placed clear of it", () => {
  const p = placeLabels(items, { fontSize: 18, fixed, bounds: [0, 1000], fixedYield: true });
  assert.equal(p.length, 2);
  const a = p.find((b) => b.key === "A|collar"), b = p.find((x) => x.key === "B|collar");
  assert.equal(a.moved, true); assert.equal(a.y, 80);
  assert.equal(b.moved, false, "placed automatically");
  assert.ok(!overlap(a, b));
  // where they fit, the dragged spots are kept
  const q = placeLabels(items, { fontSize: 9, fixed, bounds: [0, 1000], fixedYield: true });
  assert.ok(q.every((x) => x.moved));
});

test("the section window yields only in the print-size pass", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /printing=\{printScale != null\}/);
  assert.match(s, /dropCrowded: true, fixedYield: printing/);
});

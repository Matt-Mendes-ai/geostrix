// TASKS.csv #3180 (#3028 (4), review #2876 WA iron) — the Atlas dialog stayed open after a run with 'Generate 143 pages' still live, and it
// opened with a 1.1 s stall drawing 6,390 checkboxes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");

test("the hole list draws only the rows in view, at a fixed row height", () => {
  assert.match(s, /useVirtualRows\(items\.length, ITEM_ROW_H, \{ containerHeight: 180 \}\)/);
  assert.match(s, /items\.slice\(startIndex, endIndex\)\.map\(/);
  assert.match(s, /height: ITEM_ROW_H, boxSizing: "border-box"/);
  assert.match(s, /<div ref=\{scrollRef\} onScroll=\{onScroll\}/);
  assert.doesNotMatch(s, /\{items\.map\(\(it\) => \{/, "no longer every row");
});

test("after a run Generate waits for a new selection, and Close sits by the result", () => {
  assert.match(s, /setRanOn\(selectedIds\); \/\/ #3180\r?\n\s*setResult\(\{ ok: !failed\.length, text: tr\("Generated \{n\} page\(s\)\."/);
  assert.match(s, /disabled=\{busy \|\| !selectedCount \|\| ranOn === selectedIds/);
  assert.match(s, /\{ranOn && <button onClick=\{onClose\}/);
});

// TASKS.csv #2488 (review #2486, WA lithium) — a collar-field pick whose field name has a space ('hole type') matched no hole: the pick
// replaced the spaces of the value only, and the filter splits terms on spaces
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarsMatching } from "../src/lib/holeFilter.js";
import { normalizeHoleType } from "../src/lib/holeType.js";

const collars = [
  ...Array.from({ length: 3 }, (_, i) => ({ hole_id: `DD${i}`, attrs: { "hole type": "Diamond (DD)", "Drill Code": "DD" } })),
  ...Array.from({ length: 5 }, (_, i) => ({ hole_id: `AC${i}`, attrs: { "hole type": "Aircore (AC)", "Drill Code": "AC" } })),
];
const pick = (key, v) => `${key.replace(/\s+/g, "_")}=${v.replace(/\s+/g, "_")}`; // what the pick writes now

test("a pick on a field with a space in its name lists its holes", () => {
  assert.equal(collarsMatching(collars, pick("hole type", "Diamond (DD)")).length, 3);
  assert.equal(collarsMatching(collars, pick("Drill Code", "AC")).length, 5);
  assert.equal(collarsMatching(collars, "hole type=Diamond_(DD)").length, 0); // the old term: 'hole' + 'type=…'
});

test("a project with the file's 'hole_type' column and the 'hole type' class beside it: both picks work (WA uranium)", () => {
  const both = [
    ...Array.from({ length: 4 }, (_, i) => ({ hole_id: `A${i}`, attrs: { hole_type: "AC", "hole type": "Aircore (AC)" } })),
    ...Array.from({ length: 2 }, (_, i) => ({ hole_id: `D${i}`, attrs: { hole_type: "DDH", "hole type": "Diamond (DD)" } })),
  ];
  assert.equal(collarsMatching(both, pick("hole type", "Diamond (DD)")).length, 2); // was 0: only 'hole_type' (DDH) was read
  assert.equal(collarsMatching(both, pick("hole type", "Aircore (AC)")).length, 4);
  assert.equal(collarsMatching(both, pick("hole_type", "DDH")).length, 2);
  assert.equal(collarsMatching(both, pick("hole_type", "AC")).length, 4);
});

test("the pick writes the key's spaces as '_' too, and RC is named in full", () => {
  const s = readFileSync(new URL("../src/modules/viewer/HoleFilterBar.jsx", import.meta.url), "utf8");
  assert.match(s, /const termOf = \(key, v\) => `\$\{key\.replace\(\/\\s\+\/g, "_"\)\}=\$\{v\.replace\(\/\\s\+\/g, "_"\)\}`;/); // #3356: one helper for both menus
  assert.match(s, /value=\{termOf\(ch\.key, v\)\}/);
  assert.equal(normalizeHoleType("RC"), "Reverse circulation (RC)");
});

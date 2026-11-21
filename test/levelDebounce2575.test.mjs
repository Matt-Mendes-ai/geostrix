// TASKS.csv #2575 (review #2486, WA lithium) — typing a Level no longer re-reads every hole-based card per keystroke
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");

test("the Level is a draft until Enter, leaving the field or 600 ms without typing", () => {
  assert.match(p, /const level = useMemo\(\(\) => \{\s*const v = levelApplied\.map\(/);
  assert.match(p, /setTimeout\(\(\) => setLevelApplied\(\(a\) => \(sameLevel\(a, levelText\) \? a : levelText\)\), 600\)/);
  // TASKS.csv #3926 — the four boxes are NumberInputs: what is typed stays in the box (no re-read per keystroke) and is applied when the box is left or Enter is pressed
  assert.equal((p.match(/<NumberInput allowEmpty[^>]*onChange=\{\(v\) => setLevelAt\([0-3], v\)\}/g) || []).length, 4); // #3438: the RL pair and the depth pair
  assert.match(p, /const setLevelAt = \(i, v\) => \{ const next = levelText\.map\(\(x, j\) => \(j === i \? \(v == null \? "" : String\(v\)\) : x\)\); setLevelText\(next\); setLevelApplied\(/);
});

test("the cards are read once per applied Level, after a line that says so has painted", () => {
  assert.match(p, /setLevelBusy\(true\);\s+const t = setTimeout\(\(\) => \{\s+setLayers/);
  assert.match(p, /Reading the hole-based cards at the new Level…/);
  assert.match(p, /setLevelText\(lt\); setLevelApplied\(lt\);/); // a saved Level is applied at once
});

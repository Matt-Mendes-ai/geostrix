// TASKS.csv #2257 — Planned holes: 'Az 360°' for 359.6, a handed-over target refilled on every reopen, notes left over after Add or a new collar
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { wrap360 } from "../src/lib/azimuthRef.js";

const p = fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8");

test("the row's azimuth wraps after rounding: 359.6 is 0, 0.4 is 0, 180.5 is 181, -0.3 is 0", () => {
  const shown = (az) => Math.round(wrap360(Number(az))) % 360;
  assert.deepEqual([359.6, 0.4, 180.5, -0.3, 360].map(shown), [0, 0, 181, 0, 0]);
  assert.match(p, /\{ v: Math\.round\(wrap360\(Number\(hole\.azimuth\)\)\) % 360/);
});

test("a hand-over is used once across reopenings; typing a collar or adding a hole clears the notes about the last one", () => {
  assert.match(p, /const appliedPresets = new WeakSet\(\);/);
  assert.match(p, /presetTarget === lastPreset\.current \|\| appliedPresets\.has\(presetTarget\)\) return;\s*lastPreset\.current = presetTarget; appliedPresets\.add\(presetTarget\);/);
  assert.match(p, /const editCollar = \(k, v\) => \{ set\(k, v\); setCollarNote\(null\); setUpward\(false\); setPickInForm\(false\); \};/);
  for (const k of ["x", "y", "z"]) assert.match(p, new RegExp(`editCollar\\("${k}", v\\)`));
  assert.match(p, /setPickInForm\(false\); setUpward\(false\); \/\/ #1838; upward: #2257/);
  // each hand-over from Undrilled zones is a new object, so the same zone can be planned again
  assert.match(fs.readFileSync("src/modules/ViewerModule.jsx", "utf8"), /onPlanTo=\{\(c\) => \{ setPlanTarget\(\{ x: c\.x, y: c\.y, z: c\.z \}\)/);
});

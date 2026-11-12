// TASKS.csv #2237 (review #2013, Woodjam) — the Explicit surface's 'Trim at the fault' listed 'Top of IMZ' (a stratigraphic contact)
// in one list with the faults; the Strat. stack's 'Faults that offset the stack' offered every pick type. The explicit picker now
// puts the faults apart from the other surfaces; the stack's picker already groups 'Named as faults' / 'Other structure types'
// (#1225 / #1549).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the explicit fault picker groups faults apart from the other surfaces", () => {
  const src = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");
  assert.match(src, /\[\[true, tr\("Faults"\)\], \[false, tr\("Other surfaces \(not typed as faults\)"\)\]\]\.map\(\(\[isFault, label\]\) =>/);
  assert.match(src, /faultChoices\.filter\(\(x\) => \(x\.type === "fault"\) === isFault\)/);
  assert.match(src, /<optgroup key=\{label\} label=\{label\}>/);
});

test("the stack's fault picker keeps its two groups", () => {
  const src = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(src, /\[\[true, tr\("Named as faults"\)\], \[false, tr\("Other structure types"\)\]\]/);
});

// TASKS.csv #2415 (review #2325) — 'Time-scale colours' fetched Macrostrat over the internet and said so ('(online)'). Since TASKS.csv #2690
// (Matt's decision 2026-11-12) the colours are bundled: the label and tooltip say they need no internet, and no offline message is left.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the button says the colours are included (no longer online)", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /\{tr\("Time-scale colours"\)\}<\/button>/);
  assert.match(p, /\(Macrostrat, CC BY 4\.0, included with GeoStrix: no internet needed\)\. The others keep their colours\."\)\}/);
  assert.doesNotMatch(p, /Time-scale colours \(online\)/);
  assert.doesNotMatch(p, /The time-scale colours come from Macrostrat over the internet/);
});

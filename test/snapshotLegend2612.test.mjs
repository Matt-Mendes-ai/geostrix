// TASKS.csv #2612 — a snapshot's bound legend (a strip log's, a section's) stays on the sheet: right of the image, else below it when that
// fits, else the page's free spot
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the legend placement falls back to a free spot", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const spot = right \+ 170 <= A4\.w \? \{ x: right, y: a\.y \} : a\.y \+ a\.h \+ 16 \+ lh <= A4\.h \? \{ x: a\.x, y: a\.y \+ a\.h \+ 16 \} : freeSpot\(placedSoFar, 170, lh, A4\);/);
  assert.match(m, /return \{ id: `legend_\$\{a\.id\}`, type: "legend", \.\.\.spot, items, boundViewportId: a\.id \};/);
});

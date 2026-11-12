// TASKS.csv #2738 — drill plan labels, its grid labels and the atlas hole mark sit on a white box, not a stroked halo (a halo is a second
// copy of the text in the PDF)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { labelBackdrop } from "../src/lib/drillPlan.js";

test("the box covers the text for each anchor", () => {
  const s = labelBackdrop("DH-01", 100, 50, 10);
  assert.ok(s.x <= 100 && s.x + s.w >= 100 + 5 * 10 * 0.56 && s.y <= 50 - 10 + 1 && s.y + s.h >= 50, JSON.stringify(s));
  const e = labelBackdrop("DH-01", 100, 50, 10, "end");
  assert.ok(e.x + e.w >= 100 && e.x <= 100 - 5 * 10 * 0.56, JSON.stringify(e));
  const m = labelBackdrop("DH-01", 100, 50, 10, "middle");
  assert.ok(Math.abs(m.x + m.w / 2 - 100) < 1e-9);
});

test("wired: no stroked halo left on these labels", () => {
  const d = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(d, /paintOrder="stroke"/);
  assert.match(d, /const b = labelBackdrop\(l\.id, l\.x, l\.y, d\.fontPx, l\.anchor\);/);
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /labelBackdrop\(el\.markHole\.id, W \/ 2 \+ u \+ 11, H \/ 2 \+ v \+ 4, font\.fontSize\)/);
  assert.doesNotMatch(m, /fill="#d62f2f" stroke="#ffffff" strokeWidth=\{3\} paintOrder="stroke"/);
});

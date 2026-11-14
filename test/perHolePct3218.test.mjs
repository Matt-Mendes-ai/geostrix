// TASKS.csv #3218 (review #3195, Galore Creek) — Best intercepts 'Total per hole' with 'Show as %' printed ppm under per-cent headings:
// 'Cu (%) 14,810.997', 'Grade x thickness (% x m) 4,135,378.6'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeTotals, holeTotalsDisplay } from "../src/lib/accumulation.js";

test("every grade column under a '%' heading is the stored value times the display factor", () => {
  // one hole, two intercepts in ppm Cu: 100 m @ 15,000 and 50 m @ 13,000
  const ints = [{ hole_id: "H1", from: 0, to: 100, length: 100, grade: 15000, sampledM: 100 }, { hole_id: "H1", from: 150, to: 200, length: 50, grade: 13000, sampledM: 50 }];
  const [stored] = holeTotals(ints);
  const [shown] = holeTotalsDisplay([stored], (v) => v / 1e4);
  assert.equal(shown.thicknessM, stored.thicknessM, "metres are not a grade");
  assert.equal(shown.intercepts, 2);
  assert.ok(Math.abs(shown.gt - stored.gt / 1e4) < 1e-9);
  assert.ok(Math.abs(shown.meanGrade - stored.meanGrade / 1e4) < 1e-12);
  assert.ok(shown.meanGrade < 2, `${shown.meanGrade} reads as per cent`);
  assert.deepEqual(holeTotalsDisplay([stored])[0], stored, "no factor: as stored");
  assert.equal(holeTotalsDisplay([{ ...stored, meanGrade: null }], (v) => v / 1e4)[0].meanGrade, null);
});

test("wiring: the per-hole rows go through the intercept rows' conversion", () => {
  const s = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(s, /holeTotalsDisplay\(holeTotals\(results\), dg\)/);
  assert.match(s, /const dg = \(v\) => \(conv \? toDisplay\(v, unit, shownUnit\) : v\);/ /* #3236 — any plain unit */);
});

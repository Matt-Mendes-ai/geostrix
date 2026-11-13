// TASKS.csv #3181 (#3028 (6), review #2876 WA iron) — 'Fit the holes' on the 201 x 127 mm starter frame gave 1:200,000 where 1:150,000 holds the
// field with 9 % to spare: the margin each side is now 6 % of the frame or 5 mm, whichever is less
import test from "node:test";
import assert from "node:assert/strict";
import { fitDrillPlan, PAGE_PX_PER_PAPER_M } from "../src/lib/drillPlan.js";

const P = [500, 1000, 1500, 2000, 2500, 5000, 10000, 15000, 20000, 25000, 50000, 100000, 150000, 200000, 250000, 500000, 1000000];
const mm = (v) => (v / 1000) * PAGE_PX_PER_PAPER_M;
const field = (spanX, spanY) => [{ hole_id: "A", x: 0, y: 0, dip: -90, length: 10 }, { hole_id: "B", x: spanX, y: spanY, dip: -90, length: 10 }];

test("the review's frame: a field 91 % of the frame's width at 1:150,000 fits at 1:150,000", () => {
  const spanX = 0.91 * 0.201 * 150000, spanY = 0.5 * 0.127 * 150000;
  assert.equal(fitDrillPlan(field(spanX, spanY), mm(201), mm(127), P).scale, 150000);
  // 96 % of the width needs the next scale (5 mm a side leaves 191 / 201 = 95 %)
  assert.equal(fitDrillPlan(field(0.96 * 0.201 * 150000, spanY), mm(201), mm(127), P).scale, 200000);
});

test("a small frame keeps its 6 % margin (under 5 mm)", () => {
  // a 60 mm frame: 6 % = 3.6 mm a side; a field filling 89 % of it at 1:10,000 does not fit there
  const w = mm(60), h = mm(40);
  assert.equal(fitDrillPlan(field(0.89 * 0.06 * 10000, 0.3 * 0.04 * 10000), w, h, P).scale, 15000);
  assert.equal(fitDrillPlan(field(0.87 * 0.06 * 10000, 0.3 * 0.04 * 10000), w, h, P).scale, 10000);
});

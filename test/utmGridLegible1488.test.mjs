// TASKS.csv #1488 — the Layout's UTM grid is never drawn closer than 10 mm on paper, and labels that would overprint are left off.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { legibleGridStep, keepLabelsApart, PAGE_PX_PER_MM, MIN_GRID_MM } from "../src/lib/layoutGeometry.js";

const mPerPxAt = (scale) => (scale * 25.4) / 96 / 1000; // metres of ground per 96-dpi page px at 1 : scale

test("30 m at 1:25,000 (1.2 mm on paper, the review's case) is drawn every 250 m; a legible spacing is kept", () => {
  const g = legibleGridStep(30, mPerPxAt(25000));
  assert.equal(g.bumped, true);
  assert.ok(Math.abs(g.mm - 1.2) < 0.01, `${g.mm} mm`);
  assert.equal(g.step, 250);
  assert.ok((g.step / mPerPxAt(25000)) / PAGE_PX_PER_MM >= MIN_GRID_MM);
  const ok = legibleGridStep(500, mPerPxAt(25000));
  assert.deepEqual([ok.step, ok.bumped], [500, false]);
  assert.ok(Math.abs(ok.mm - 20) < 0.01);
  // exactly 10 mm stays; 1:5,000 with 20 m (4 mm) goes to 50 m
  assert.equal(legibleGridStep(250, mPerPxAt(25000)).bumped, false);
  assert.equal(legibleGridStep(20, mPerPxAt(5000)).step, 50);
  // nothing to scale by: unchanged
  assert.deepEqual(legibleGridStep(30, null).step, 30);
});

test("labels: the first box stays, an overlapping one is left off, a clear one is kept", () => {
  const keep = keepLabelsApart([{ x: 0, y: 0, w: 50, h: 9 }, { x: 30, y: 0, w: 50, h: 9 }, { x: 60, y: 0, w: 50, h: 9 }, { x: 0, y: 20, w: 50, h: 9 }]);
  assert.deepEqual(keep, [true, false, true, true]);
});

test("the overlay and the sidebar use them", () => {
  const s = fs.readFileSync("src/modules/LayoutModule.jsx", "utf8");
  assert.match(s, /const step = legibleGridStep\(/);
  assert.match(s, /keepLabelsApart\(\[\{ x: 3, y: H - 3 - fpx/);
  assert.match(s, /too close to read: drawn every \{step\} m\./);
});

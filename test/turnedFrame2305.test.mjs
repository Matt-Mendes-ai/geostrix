// TASKS.csv #2305 — a north-south block in a landscape drill-plan frame: the sidebar offers the turned frame and the larger scale it gives
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { turnedFrameFit, fitDrillPlan } from "../src/lib/drillPlan.js";

const PRESETS = [500, 1000, 1500, 2000, 2500, 5000, 10000, 15000, 20000, 25000, 50000, 100000];
// the review's deposit: 727 x 1,224 m with its traces (vertical holes here: the collars span it)
const collars = [];
for (let i = 0; i < 20; i++) collars.push({ hole_id: `WB${i}`, x: 31867 + (i % 4) * 190, y: 807734 + Math.floor(i / 4) * 296, dip: 90, length: 100 });

test("a 760 x 480 px landscape frame fits it coarser than the same frame turned", () => {
  const now = fitDrillPlan(collars, 760, 480, PRESETS), t = turnedFrameFit(collars, 760, 480, PRESETS);
  assert.ok(t, "a turned fit is offered");
  assert.ok(t.scale < now.scale, `${t.scale} < ${now.scale}`);
  assert.deepEqual([t.w, t.h, t.from], [480, 760, now.scale]);
});

test("no offer when the frame already suits the holes", () => {
  assert.equal(turnedFrameFit(collars, 480, 760, PRESETS), null);
  const wide = collars.map((c) => ({ ...c, x: c.y - 807734 + 31867, y: c.x - 31867 + 807734 })); // the same block east-west
  assert.equal(turnedFrameFit(wide, 760, 480, PRESETS), null);
});

test("wired in the drill plan's sidebar", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const t = turnedFrameFit\(filterHoles\(tableCollars \|\| \[\], sel\.holeFilter\), sel\.w, sel\.h, SCALE_PRESETS\)/);
  assert.match(m, /updateSelected\(\{ w: t\.w, h: t\.h, scale: t\.scale, centre: t\.centre \}\)/);
});

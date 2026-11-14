// TASKS.csv #3358 (#2259) — the Drill plan ribbon button was disabled without drilled collars, so a project that only has planned holes could not
// make one. SYNTHETIC planned holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fitDrillPlan, plannedAsCollars, drillPlanPlanned } from "../src/lib/drillPlan.js";

const planned = [{ name: "P1", x: 1000, y: 2000, z: 300, azimuth: 90, dip: -60, length: 200 }, { name: "P2", x: 1100, y: 2100, z: 300, azimuth: 90, dip: -60, length: 200 }];
test("a plan of planned holes alone fits and draws them", () => {
  const SCALES = [1000, 2000, 5000, 10000];
  const fit = fitDrillPlan([...[], ...plannedAsCollars(planned)], 600, 400, SCALES);
  assert.ok(fit && fit.scale > 0 && Number.isFinite(fit.centre.x));
  assert.equal(drillPlanPlanned({ w: 600, h: 400, scale: fit.scale, centre: fit.centre }, planned).length, 2);
});
test("the ribbon button needs collars or planned holes", () => {
  const l = fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(l, /label="Drill plan" tone="view" disabled=\{!collars\.length && !\(plannedHoles \|\| \[\]\)\.length/);
});

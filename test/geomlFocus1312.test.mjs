// TASKS.csv #1312 — dense sampling near a unit, by default only for thin runs; the test on unseen holes
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planDomain, unitRuns, focusPlan, FOCUS_OTHER } from "../src/lib/geomlPlan.js";

const FAST = { trainSpacing: 10, inducingSpacing: 80, iterations: 150 };
const T = new Set(["U"]);
// holes of 300 m of other rock with `n` runs of the unit, `len` metres each, separated by other rock
const project = (holes, n, len) => {
  const collars = [], intervals = [];
  for (let h = 0; h < holes; h++) {
    collars.push({ hole_id: `H${h}`, x: h * 100, y: 0, z: 0 });
    let d = 0;
    for (let i = 0; i < n; i++) { intervals.push({ hole_id: `H${h}`, from: d, to: d + 30, value: "X" }, { hole_id: `H${h}`, from: d + 30, to: d + 30 + len, value: "U" }); d += 30 + len; }
    intervals.push({ hole_id: `H${h}`, from: d, to: d + 100, value: "X" });
  }
  return { collars, intervals };
};

test("#1312 thin runs get dense sampling by default, thick ones do not", () => {
  const thin = planDomain({ ...project(10, 3, 3), targets: T, ...FAST });
  assert.equal(thin.focus.medianRunM, 3);
  assert.equal(thin.denseOn, true);
  const thick = planDomain({ ...project(10, 3, 40), targets: T, ...FAST });
  assert.equal(thick.focus.thin, false);
  assert.equal(thick.denseOn, false);
});

test("#1312 the geologist's tick overrides the rule, and the estimate follows", () => {
  const p = project(10, 3, 40);
  const off = planDomain({ ...p, targets: T, ...FAST }), on = planDomain({ ...p, targets: T, ...FAST, dense: true });
  assert.equal(on.denseOn, true);
  assert.ok(on.points > off.points);
  assert.equal(planDomain({ ...project(10, 3, 3), targets: T, ...FAST, dense: false }).denseOn, false);
});

test("#1312 not offered where it was not tested or cannot fit", () => {
  const p = project(10, 3, 3);
  assert.equal(planDomain({ ...p, targets: T, ...FAST, deep: true }).denseOn, false, "the deep model");
  assert.equal(planDomain({ ...p, targets: T, trainSpacing: 2.5, inducingSpacing: 25, iterations: 600 }).focus.available, false, "already that fine");
  const huge = planDomain({ ...project(20, 10, 200), targets: T, ...FAST });
  assert.equal(huge.focus.available, false, "the unit alone would pass the budget");
});

test("#1312 runs are the unit's own, merged across split intervals", () => {
  const iv = [{ hole_id: "A", from: 0, to: 2, value: "U" }, { hole_id: "A", from: 2, to: 5, value: "U" }, { hole_id: "A", from: 5, to: 9, value: "X" }, { hole_id: "A", from: 9, to: 10, value: "U" }];
  assert.deepEqual(unitRuns(iv, T), [5, 1]);
  assert.equal(focusPlan(iv, T, 10, 2, 2).points, 2 + 1 + 2 + 2, "units' points at 2.5 m + contacts + other");
  assert.ok(FOCUS_OTHER >= 1000);
});

test("#1312 the add-on and the panel carry it, and the old fit wording is gone", () => {
  const m = fs.readFileSync(new URL("../addons/geoml/geostrix_geoml/models.py", import.meta.url), "utf8");
  assert.match(m, /def _focused_points/);
  assert.match(m, /def _held_out_check/);
  assert.match(m, /result\["held_out"\]/);
  const s = fs.readFileSync(new URL("../addons/geoml/geostrix_geoml/server.py", import.meta.url), "utf8");
  assert.match(s, /"focus_sampling", "held_out_check"/);
  const p = fs.readFileSync(new URL("../src/components/PredictivePanel.jsx", import.meta.url), "utf8");
  assert.match(p, /focus_other: FOCUS_OTHER/);
  assert.doesNotMatch(p, /Fit to the logs/);
});

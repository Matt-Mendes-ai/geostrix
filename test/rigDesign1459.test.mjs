// TASKS.csv #1459 — the rig CSV / KML / GPX carry the design assumptions: lift, drift, the target, where it is reached and
// the metres drilled past it, so an aim-off hole does not reach the rig looking mis-aimed.
import test from "node:test";
import assert from "node:assert/strict";
import { rigRows, rigKML, rigGPX } from "../src/lib/rigExport.js";
import { plannedTrace, solveWithDeviation } from "../src/lib/holePlanning.js";

const collar = { x: 684000, y: 5511000, z: 1600 };
const target = { x: 684100, y: 5511300, z: 1100 };

test("an aim-off hole carries its lift, drift, target depth, miss and past-target metres", () => {
  const s = solveWithDeviation(collar, target, { lift: 2, drift: 1 });
  const hole = { name: "P-1", ...collar, azimuth: s.azimuth, dip: s.dip, length: s.length + 30, lift: 2, drift: 1, target, pastTargetM: 30 };
  const [r] = rigRows([hole], 26909, "2026-11-07", plannedTrace);
  assert.equal(r.lift_deg_per_100m, 2);
  assert.equal(r.drift_deg_per_100m, 1);
  assert.equal(r.target_x, 684100);
  assert.ok(r.target_miss_m < 1, `passes within ${r.target_miss_m} m`);
  assert.ok(Math.abs(r.target_depth_m - s.length) < 1, `${r.target_depth_m} vs ${s.length}`);
  assert.ok(Math.abs(r.past_target_m - 30) < 1, `${r.past_target_m} m past`);
  const kml = rigKML([r], "t"), gpx = rigGPX([r]);
  assert.match(kml, /Aimed off for lift 2°\/100 m and drift 1°\/100 m\./);
  assert.match(kml, /m past it\./);
  assert.match(gpx, / m. Aimed off for lift 2/);
});

test("a straight hole without a target: zero lift / drift, blank target columns, no extra words", () => {
  const hole = { name: "P-2", ...collar, azimuth: 45, dip: -60, length: 300 };
  const [r] = rigRows([hole], 26909, "2026-11-07", plannedTrace);
  assert.equal(r.lift_deg_per_100m, 0);
  assert.equal(r.drift_deg_per_100m, 0);
  assert.equal(r.target_depth_m, "");
  assert.equal(r.past_target_m, "");
  assert.equal(r.target_miss_m, "");
  assert.doesNotMatch(rigKML([r], "t"), /Aimed off|past it/);
  // the new columns are in the CSV (enumerable), in a fixed place after the target
  const keys = Object.keys(r);
  assert.ok(keys.indexOf("lift_deg_per_100m") > keys.indexOf("target_z") && keys.indexOf("target_miss_m") < keys.indexOf("toe_x"));
});

// TASKS.csv #584 (strike-derived dip directions counted for the import notice) and #577 (grid vs true azimuth on
// the collar export).
import test from "node:test";
import assert from "node:assert/strict";
import { strikeStats } from "../src/lib/viewer/importHelpers.js";
import { trueNorthBearingInGridDeg } from "../src/lib/inversion.js";

test("#584 strikeStats counts derived and inconsistent rows", () => {
  const rows = [
    { s: "30", dd: "" },      // derived (no dip direction)
    { s: "30", dd: "120" },   // consistent (RHR)
    { s: "30", dd: "121.5" }, // within 2° — consistent
    { s: "30", dd: "300" },   // left-hand rule / typo — mismatch
    { s: "", dd: "45" },      // no strike — ignored
    { s: "350", dd: "80" },   // 350 + 90 = 440 = 80 — consistent across 360
  ];
  assert.deepEqual(strikeStats(rows, { strike: "s", azimuth: "dd" }), { derived: 1, mismatches: 1 });
  assert.deepEqual(strikeStats(rows, { strike: "s" }), { derived: 5, mismatches: 0 });
  assert.deepEqual(strikeStats(rows, { azimuth: "dd" }), { derived: 0, mismatches: 0 });
});

test("#577 grid convergence: true = grid - convergence", () => {
  // UTM 9N (Golden Triangle). Meridians converge on the pole, so east of the central meridian (129°W) true north
  // leans west of grid north (a negative grid bearing) and west of it, east
  const east = trueNorthBearingInGridDeg(650000, 6280000, 32609);
  const west = trueNorthBearingInGridDeg(350000, 6280000, 32609);
  const centre = trueNorthBearingInGridDeg(500000, 6280000, 32609);
  assert.ok(Math.abs(centre) < 0.01, `on the central meridian convergence ~0, got ${centre}`);
  assert.ok(east < 0 && west > 0, `east ${east} / west ${west}`);
  assert.ok(Math.abs(east) > 1 && Math.abs(east) < 3, `magnitude ${east}`);
  // a hole drilled along true north from the east side: grid azimuth = convergence, true = 0
  const grid = ((east % 360) + 360) % 360;
  const tru = ((((grid - east) % 360) + 360) % 360);
  assert.ok(tru < 1e-9 || tru > 360 - 1e-9);
});

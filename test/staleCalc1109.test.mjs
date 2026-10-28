// TASKS.csv #1109 — calculator picks whose hole has since moved are listed by Data QC
import { test } from "node:test";
import assert from "node:assert/strict";
import { staleCalculatorPicks, runDataQC } from "../src/lib/dataQC.js";

const collars = [{ hole_id: "DH1", x: 0, y: 0, z: 1000, azimuth: 45, dip: 60, length: 200 }];
const pick = (az, dip) => ({ hole_id: "DH1", depth: 100, value: "VN", dip: 50, azimuth: 120, alpha: 40, beta_scribed: 200, hole_az_used: az, hole_dip_used: dip });

test("#1109 a pick solved with the survey's own attitude is not stale; one solved 15 deg off is", () => {
  const survey = [{ hole_id: "DH1", depth: 0, azimuth: 45, dip: 60 }, { hole_id: "DH1", depth: 200, azimuth: 45, dip: 60 }];
  assert.equal(staleCalculatorPicks(collars, survey, [pick(45, 60)]).length, 0);
  const s = staleCalculatorPicks(collars, survey, [pick(30.2, 60)]); // the survey was re-imported +14.8 deg
  assert.equal(s.length, 1);
  assert.ok(s[0].angle > 7 && s[0].angle < 8, String(s[0].angle)); // 14.8 deg of azimuth at 60 deg dip = ~7.4 deg of direction
  assert.ok(Math.abs(s[0].now.azimuth - 45) < 1e-6);
});

test("#1109 ordinary picks (no hole attitude stored) are ignored, and Data QC reports the stale one", () => {
  const survey = [{ hole_id: "DH1", depth: 0, azimuth: 45, dip: 60 }];
  assert.equal(staleCalculatorPicks(collars, survey, [{ hole_id: "DH1", depth: 100, dip: 50, azimuth: 120 }]).length, 0);
  const res = runDataQC({ project: {}, collars, survey, layers: { structure: [pick(30.2, 60)] }, boundaries: [], assays: [] });
  assert.ok(res.issues.some((i) => /calibrated with the hole at azimuth 30\.2/.test(i.message)), res.issues.map((i) => i.message).join("\n"));
});

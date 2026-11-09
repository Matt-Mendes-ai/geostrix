// TASKS.csv #2186 (review #2174, WA gold) — underground fans whose collars carry no azimuth / dip: told from duplicates by the first survey station
import test from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";

const collar = (id, x = 1000, y = 2000) => ({ hole_id: id, x, y, z: 100, length: 100 });
const st = (id, az, dip) => [{ hole_id: id, depth: 0, azimuth: az, dip }, { hole_id: id, depth: 50, azimuth: az + 1, dip }];
const run = (collars, survey) => runDataQC({ project: { epsg: 28351, crsSet: false }, collars, survey, layers: {}, boundaries: [], assays: [] }).issues.filter((i) => i.category === "Collars");

test("#2186 a fan from one cuddy (no collar attitude, surveys differ) is a pad note, not a duplicate warning", () => {
  const ids = ["WB0706UD", "WB0707UD", "WB0708UD"];
  const issues = run(ids.map((id) => collar(id)), [...st(ids[0], 120, 30), ...st(ids[1], 140, 10), ...st(ids[2], 160, -20)]);
  assert.equal(issues.filter((i) => i.severity === "warning").length, 0, JSON.stringify(issues));
  assert.ok(issues.some((i) => i.severity === "info" && /drill pad \(fan\)/.test(i.message)));
});

test("#2186 the same attitude in the surveys is still a possible duplicate; no survey at all keeps the old warning", () => {
  assert.ok(run([collar("A"), collar("B")], [...st("A", 90, 60), ...st("B", 90, 60)]).some((i) => i.severity === "warning" && /same azimuth and dip/.test(i.message)));
  assert.ok(run([collar("A"), collar("B")], []).some((i) => i.severity === "warning" && /share essentially the same collar location/.test(i.message)));
});

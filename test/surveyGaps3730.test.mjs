// TASKS.csv #3730 — a stretch of a hole with no survey station is a Data QC warning (Scottie Gold: DH-23-299, 0 m then 339 m then every 3 m)
import test from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";
import { surveyGapFinder } from "../src/lib/surveyGaps.js";

const stations = (id, depths) => depths.map((depth) => ({ hole_id: id, depth, azimuth: 90, dip: -60 }));
const every = (a, b, step) => { const o = []; for (let d = a; d <= b; d += step) o.push(d); return o; };
const validateSurveyAndTrajectory = (collars, survey) => runDataQC({ project: {}, collars, survey, layers: {}, boundaries: [], assays: [] }).issues;
const collar = (id, length) => ({ hole_id: id, x: 0, y: 0, z: 100, azimuth: 90, dip: -60, length });

test("DH-23-299: 0 m, 339 m, then every 3 m to 491 m of a 497 m hole is named, with its share of the hole", () => {
  const survey = [...stations("DH-23-299", [0, 339, ...every(342, 491, 3)]), ...stations("OK-1", every(0, 300, 3)), ...stations("OK-2", every(0, 300, 3))];
  const collars = [collar("DH-23-299", 497), collar("OK-1", 300), collar("OK-2", 300)];
  const out = validateSurveyAndTrajectory(collars, survey);
  const rows = out.filter((i) => i.holeId === "DH-23-299" && /No survey station between/.test(i.message));
  assert.equal(rows.length, 1);
  assert.match(rows[0].message, /between 0 m and 339 m \(68% of the hole; usually 3 m apart\)/);
  assert.equal(rows[0].severity, "warning");
  assert.equal(out.filter((i) => /No survey station between/.test(i.message)).length, 1, "the evenly surveyed holes are not flagged");
});
test("a project surveyed every 50 m is not flagged (a gap is over 5 times the usual spacing and over 50 m)", () => {
  const survey = [...stations("A", every(0, 400, 50)), ...stations("B", every(0, 400, 50))];
  const out = validateSurveyAndTrajectory([collar("A", 400), collar("B", 400)], survey);
  assert.equal(out.filter((i) => /No survey station between/.test(i.message)).length, 0);
});
test("two widest gaps: the widest is named and the count said", () => {
  const find = surveyGapFinder(new Map());
  const sorted = stations("H", [0, 100, ...every(103, 200, 3), 400, ...every(403, 460, 3)]);
  const f = find(sorted);
  assert.equal(f.gaps.length, 2); assert.deepEqual([f.widest.from, f.widest.to], [199, 400]);
});
test("a hole with few stations borrows the project's usual spacing; with no project spacing nothing is claimed", () => {
  const by = new Map([["P1", stations("P1", every(0, 300, 3))], ["P2", stations("P2", every(0, 300, 3))], ["F", stations("F", [0, 150, 160])]]);
  assert.ok(surveyGapFinder(by)(by.get("F")));
  const lone = new Map([["F", stations("F", [0, 150, 160])]]);
  assert.equal(surveyGapFinder(lone)(lone.get("F")), null);
});

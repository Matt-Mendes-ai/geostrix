// TASKS.csv #2494 (review #2486, WA lithium) — Surv_Type (Assumed / Gyro / GYRO) is used: each hole is measured or assumed (a collar
// attr the hole list filters and colours by), the spellings are folded, and Data QC says how many holes have only assumed stations
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyMethodClass, surveyMethodKey, surveyMethodByHole, foldCaseVariants } from "../src/lib/surveyMethod.js";
import { runDataQC } from "../src/lib/dataQC.js";
import { collarAttrChoices } from "../src/lib/holeFilter.js";

test("station methods: assumed vs measured; unknown words are neither", () => {
  for (const v of ["Assumed", "ASSUMED", "Planned", "Nominal", "Collar", "collar shot", "Design", "Estimated", "not surveyed"]) assert.equal(surveyMethodClass(v), "assumed", v);
  for (const v of ["Gyro", "GYRO", "Reflex EZ-Shot", "REFLEX", "Eastman multishot", "single shot", "North-seeking gyro", "DeviFlex", "Maxibor"]) assert.equal(surveyMethodClass(v), "measured", v);
  for (const v of ["", "ABC", "Smith"]) assert.equal(surveyMethodClass(v), null, v);
});

// the review's shape in small: 3 holes only Assumed, 1 Gyro, 1 GYRO, one with a collar Assumed station then Gyro below
const survey = [
  ...["A1", "A2", "A3"].flatMap((h) => [{ hole_id: h, depth: 0, azimuth: 60, dip: 60, Surv_Type: "Assumed" }, { hole_id: h, depth: 100, azimuth: 60, dip: 60, Surv_Type: "Assumed" }]),
  { hole_id: "G1", depth: 0, azimuth: 60, dip: 60, Surv_Type: "Gyro" }, { hole_id: "G1", depth: 50, azimuth: 61, dip: 59, Surv_Type: "Gyro" },
  { hole_id: "G2", depth: 0, azimuth: 60, dip: 60, Surv_Type: "GYRO" },
  { hole_id: "M1", depth: 0, azimuth: 60, dip: 60, Surv_Type: "Assumed" }, { hole_id: "M1", depth: 30, azimuth: 61, dip: 60, Surv_Type: "Gyro" },
];

test("per hole: only-assumed holes vs measured; the column found by its name; Gyro / GYRO folded to the commoner spelling", () => {
  assert.equal(surveyMethodKey(survey), "Surv_Type");
  const s = surveyMethodByHole(survey);
  assert.deepEqual(s.assumed, ["A1", "A2", "A3"]);
  assert.equal(s.measured, 3);
  assert.equal(s.byHole.get("M1"), "measured");
  assert.deepEqual([...foldCaseVariants(s.values)], [["GYRO", "Gyro"]]);
  assert.equal(surveyMethodByHole([{ hole_id: "X", depth: 0 }]), null);
});

test("Data QC: one info line naming the count; the collar attr shows up in the hole list's choices", () => {
  const collars = ["A1", "A2", "A3", "G1", "G2", "M1"].map((h, i) => ({ hole_id: h, x: i * 10, y: 0, z: 100, length: 100, attrs: { "survey method": h.startsWith("A") ? "assumed" : "measured" } }));
  const qc = runDataQC({ project: { epsg: 32609 }, collars, survey, layers: {}, boundaries: [], assays: [] });
  const lines = qc.issues.filter((i) => /only assumed survey stations/.test(i.message));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].severity, "info");
  assert.match(lines[0].message, /^3 of 6 hole\(s\) have only assumed survey stations \(Surv_Type\)/);
  const ch = collarAttrChoices(collars).find((c) => c.key === "survey method");
  assert.deepEqual([...ch.values].sort(), ["assumed", "measured"]);
});

test("the survey commit folds, tags the collars and says it", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /const methodSum = methodKey \? surveyMethodByHole\(rows, methodKey\) : null;/);
  assert.match(u, /attrs: \{ \.\.\.\(c\.attrs \|\| \{\}\), "survey method": methodSum\.byHole\.get\(c\.hole_id\) \}/);
  assert.match(u, /have only assumed survey stations \(their direction was not measured\)/);
});

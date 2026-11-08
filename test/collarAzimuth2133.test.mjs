// TASKS.csv #2133 (review #2013, Woodjam) — the Layout collar table flags a collar azimuth that disagrees with the hole's shallowest
// survey station (Woodjam: a true-north collar sheet imported as grid) instead of printing it under 'Azimuth (grid)' unremarked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarsWithSurveyAttitude } from "../src/lib/collarTable.js";
const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const survey = [
  { hole_id: "TF24-126", depth: 0, azimuth: 198.744, dip: 67 }, { hole_id: "TF24-126", depth: 30, azimuth: 199.1, dip: 66 },
  { hole_id: "DH24-119", depth: 3, azimuth: 128.2, dip: 60 },
  { hole_id: "N1", depth: 0, azimuth: 359.8, dip: 70 },
  { hole_id: "S1", depth: 0, azimuth: 90, dip: 50 },
];
test("a collar azimuth more than 0.5° from the shallowest station is flagged with the station's; wrap-around and small ones are not", () => {
  const out = Object.fromEntries(collarsWithSurveyAttitude([
    { hole_id: "TF24-126", azimuth: 200, dip: 67 },   // 1.26° off: flagged
    { hole_id: "DH24-119", azimuth: 128, dip: 60 },   // 0.2° off: not
    { hole_id: "N1", azimuth: 0.1, dip: 70 },         // 0.3° across north: not
    { hole_id: "S1", dip: 50 },                       // no collar azimuth: the #1483 fill, starred, not a disagreement
    { hole_id: "X", azimuth: 45, dip: 60 },           // no survey: untouched
  ], survey).map((c) => [c.hole_id, c]));
  assert.equal(out["TF24-126"].azSurvey, 198.744);
  assert.equal(out["TF24-126"].azimuth, 200, "the table still prints the collar record's value");
  assert.equal(out["TF24-126"].orientFromSurvey, false);
  assert.equal(out["DH24-119"].azSurvey, undefined);
  assert.equal(out.N1.azSurvey, undefined);
  assert.equal(out.S1.azimuth, 90); assert.equal(out.S1.azFromSurvey, true); assert.equal(out.S1.azSurvey, undefined);
  assert.deepEqual(out.X, { hole_id: "X", azimuth: 45, dip: 60 });
});

test("the table marks it with † and the footnote names the holes and both readings' meaning", () => {
  assert.match(L, /Number\.isFinite\(c\.azSurvey\) \? `\$\{f\(c\.azimuth, 0\)\}†`/);
  assert.match(L, /† The collar record's azimuth, which differs from the hole's shallowest survey station \(grid north\) by more than 0\.5°/);
  assert.match(L, /\[\*†\]\?\$\//, "a † value is still a number for alignment");
});

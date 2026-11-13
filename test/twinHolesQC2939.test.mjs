// TASKS.csv #2939 (review #2876, WA iron) — Data QC compared two collars' attitudes as a rounded azimuth | dip key, so a vertical RC hole
// (-90 / 0) and its diamond twin (-89 / 279.5) were 'a drill pad (fan)'. The holes are now compared by the angle between their directions.
import test from "node:test";
import assert from "node:assert/strict";
import { runDataQC, holeDirection, angleBetween, SAME_DIRECTION_DEG } from "../src/lib/dataQC.js";

const collar = (id, azimuth, dip, x = 500000, y = 7000000) => ({ hole_id: id, x, y, z: 300, length: 60, azimuth, dip });
const run = (collars) => runDataQC({ project: { epsg: 28350, crsSet: true }, collars, survey: [], layers: {}, boundaries: [], assays: [] }).issues.filter((i) => i.category === "Collars");

test("directions: a near-vertical hole's azimuth hardly moves it; a real fan is degrees apart", () => {
  assert.ok(angleBetween(holeDirection(0, 90), holeDirection(279.5, 89)) <= 1.0001);
  assert.ok(Math.abs(angleBetween(holeDirection(90, 60), holeDirection(100, 60)) - 5) < 0.1, "10° of azimuth at 60° dip is 5°");
  assert.ok(angleBetween(holeDirection(90, 60), holeDirection(90, 60, true)) > 100, "an uphole is not a downhole");
  assert.equal(SAME_DIRECTION_DEG, 3);
});

test("the review's pair: an RC hole and its diamond twin, both vertical, are one direction (a warning naming a twin), not a fan", () => {
  const out = run([collar("RHRCMET_0005_A", 0, -90), collar("RHDMET_0005", 279.5, -89)]);
  assert.ok(!out.some((i) => /drill pad \(fan\)/.test(i.message)), JSON.stringify(out));
  const w = out.find((i) => i.severity === "warning");
  assert.match(w.message, /2 holes \(RHRCMET_0005_A, RHDMET_0005\) share the same collar \(within 1m\) AND point the same way \(within 3°\) — a twin or re-drill/);
});

test("a fan from one pad stays a pad note; a twin within a fan is named and the pad still noted", () => {
  const fan = run([collar("F1", 90, -60), collar("F2", 120, -60), collar("F3", 150, -60)]);
  assert.equal(fan.filter((i) => i.severity === "warning").length, 0);
  assert.ok(fan.some((i) => i.severity === "info" && /3 holes \(F1, F2, F3\).*drill pad \(fan\)/.test(i.message)));
  const mixed = run([collar("V1", 0, -90), collar("V2", 200, -89.5), collar("A1", 45, -55)]);
  assert.ok(mixed.some((i) => i.severity === "warning" && /\(V1, V2\)/.test(i.message)));
  assert.ok(mixed.some((i) => i.severity === "info" && /3 holes \(V1, V2, A1\)/.test(i.message)));
});

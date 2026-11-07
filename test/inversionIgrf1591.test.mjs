// TASKS.csv #1591 — subtract the computed IGRF as a base level, untick the data statement when the survey changes, and no
// 'consider the best-fit plane' when the plane is chosen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { igrfField, decimalYear } from "../src/lib/igrf.js";

const s = fs.readFileSync("src/components/InversionPanel.jsx", "utf8");

test("the option, its requirement and the subtraction before the mean", () => {
  assert.match(s, /<option value="igrf">\{tr\("Subtract the IGRF field \(computed above\), then the mean"\)\}<\/option>/);
  assert.match(s, /baseLevel === "igrf" && !\(field\.igrfPlane && field\.igrfPlane\.date === field\.date\)/);
  assert.match(s, /observed\.push\(r\.value - g\)/);
  assert.match(s, /request\.baseLevel = baseLevel === "igrf" \? "mean" : baseLevel;/);
});

test("the statement is unticked when the survey changes; the plane gets its own note", () => {
  assert.match(s, /if \(surveySeen\.current !== activeSurvey\) \{ surveySeen\.current = activeSurvey; setConfirmed\(false\); \}/);
  assert.match(s, /baseLevel === "plane" \/\* #1591/);
});

test("why a plane: the IGRF changes by several nT over a survey of a few kilometres (Lawyers, 2021-06-19)", () => {
  const d = decimalYear("2021-06-19");
  const a = igrfField(-127.237, 57.344, 1.517, d).total, b = igrfField(-127.20, 57.36, 1.517, d).total;
  assert.ok(Math.abs(a - 56197) < 2, String(a));
  assert.ok(Math.abs(b - a) > 5, `${b - a} nT across ~3 km`);
});

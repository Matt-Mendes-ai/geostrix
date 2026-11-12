// TASKS.csv #2407 (review #2325, WA uranium) — Subcrop from collars skips a code set to overburden in Modelling codes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarSubcrop, roleWithCodes } from "../src/lib/collarSubcrop.js";

const collars = [{ hole_id: "A", x: 0, y: 0, z: 330, dip: 90, azimuth: 0, length: 60 }, { hole_id: "B", x: 100, y: 0, z: 331, dip: 90, azimuth: 0, length: 60 }];
const litho = [
  { hole_id: "A", from: 0, to: 2.5, value: "QA" }, { hole_id: "A", from: 2.5, to: 6, value: "I" },
  { hole_id: "B", from: 0, to: 3, value: "QA" }, { hole_id: "B", from: 3, to: 9, value: "H" },
];

test("QA as overburden: the subcrop is what lies under it", () => {
  assert.deepEqual(collarSubcrop({ collars, survey: [], litho }).map((p) => p.unit), ["QA", "QA"]); // by name, QA is a unit
  const roleOf = roleWithCodes({ codes: [{ name: "QA", role: "overburden" }] });
  assert.deepEqual(collarSubcrop({ collars, survey: [], litho, roleOf }).map((p) => [p.unit, p.cover]), [["I", 2.5], ["H", 3]]);
  assert.equal(roleWithCodes({ codes: [] })("OVB"), "overburden"); // nothing set: the name rule
});

test("the panel passes the Modelling codes roles", () => {
  const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /collarSubcrop\(\{ collars, survey, litho: layers\.litho, desurveyMethod, roleOf: roleWithCodes\(modellingCodes\)(, report: rep)?(, atDepthM: depth)? \}\)/); // atDepthM: #2956 // report: #2411
});

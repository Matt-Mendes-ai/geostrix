// TASKS.csv #3734 — Scottie Gold: 6,434 gyro stations and three rig-aligner collar readings; the notice must add up to the hole count
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { detectAzimuthRef } from "../src/lib/azimuthRef.js";
import { surveyMethodByHole } from "../src/lib/surveyMethod.js";

const rows = (n, instrument) => Array.from({ length: n }, (_, i) => ({ hole_id: "H", depth: i, azimuth: 90, dip: -60, instrument }));
test("a few rig-aligner stations do not break the gyro hint; the dialog gets the share", () => {
  const data = [...rows(6434, "DeviGyro OX"), ...rows(3, "Devi_align")];
  const d = detectAzimuthRef(["hole_id", "depth", "azimuth", "dip", "instrument"], data);
  assert.equal(d.ref, "true"); assert.equal(d.hint, true);
  assert.deepEqual(d.share, { n: 6434, of: 6437, others: ["Devi_align"] });
});
test("still not a hint: a magnetic tool among them, or a large share by another tool, or only gyros (no share)", () => {
  const H = ["hole_id", "depth", "azimuth", "dip", "instrument"];
  assert.equal(detectAzimuthRef(H, [...rows(100, "Gyro"), ...rows(5, "Reflex EZ-Shot")]).ref, null, "gyro and magnetic: the dialog asks");
  assert.equal(detectAzimuthRef(H, [...rows(100, "Gyro"), ...rows(30, "Devi_align")]), null, "30 % by an unknown tool: no hint");
  const all = detectAzimuthRef(H, rows(50, "Gyro"));
  assert.equal(all.ref, "true"); assert.equal(all.share, undefined);
});
test("the method sentence adds up: 82 measured + 2 holes with only an aligner reading = 84", () => {
  const survey = [];
  for (let h = 0; h < 82; h++) survey.push({ hole_id: `G${h}`, instrument: "DeviGyro OX" });
  survey.push({ hole_id: "DH23-244", instrument: "Devi_align" }, { hole_id: "DH23-251", instrument: "Devi_align" });
  survey.push({ hole_id: "G0", instrument: "Devi_align" }); // a hole with both: measured wins, not counted twice
  const sm = surveyMethodByHole(survey);
  assert.equal(sm.measured, 82); assert.equal(sm.assumed.length, 0);
  assert.deepEqual(sm.unread, ["DH23-244", "DH23-251"]); assert.deepEqual(sm.unreadWords, ["Devi_align"]);
  assert.equal(sm.counted, 84);
});
test("wired: the notice and Data QC use the total, and the dialog shows the share", () => {
  const imp = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(imp, /n: methodSum\.counted/); assert.match(imp, /azimuthRefShare: d\.share/);
  assert.match(fs.readFileSync(new URL("../src/lib/dataQC.js", import.meta.url), "utf8"), /m: sm\.counted/);
  assert.match(fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8"), /modal\.azimuthRefShare/);
});

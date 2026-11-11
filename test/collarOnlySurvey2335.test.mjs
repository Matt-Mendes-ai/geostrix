// TASKS.csv #2335 (review #2325, WA uranium) — a survey with only a collar station (vertical, or a short inclined hole) is one Data QC note
// for the project, not one warning per hole; a survey that stops partway, or a long inclined collar-only hole, is still warned per hole
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDataQC } from "../src/lib/dataQC.js";

const csv = (f) => {
  const [h, ...lines] = readFileSync(f, "utf8").trim().split(/\r?\n/);
  const keys = h.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], ["hole_id", "hole_type"].includes(keys[i]) ? v : Number(v)])));
};
const qc = (collars, survey) => runDataQC({ project: { epsg: 28351, name: "t" }, collars, survey, layers: {}, boundaries: [], assays: [] }).issues.filter((i) => i.category === "Survey");

test("WA uranium: 430 collar-only vertical holes make one note, no per-hole warning", () => {
  const collars = csv("sample_data/wa_uranium/collars.csv"), survey = csv("sample_data/wa_uranium/survey.csv");
  const iss = qc(collars, survey);
  assert.equal(iss.filter((i) => /survey ends at/.test(i.message)).length, 0);
  const note = iss.filter((i) => /survey station at the collar only/.test(i.message));
  assert.equal(note.length, 1);
  assert.equal(note[0].severity, "info");
  const lens = collars.map((c) => c.length).filter((v) => v > 30); // the rule's own gap threshold
  assert.match(note[0].message, new RegExp(`^${lens.length} hole\\(s\\), ${lens.length} of them vertical, have a survey station at the collar only \\(\\d+-${Math.round(Math.max(...lens))} m deep\\)`));
  console.log(note[0].message);
});

test("a survey that stops partway, and a long inclined collar-only hole, are still warned; a short inclined collar-only hole joins the note", () => {
  const collars = [
    { hole_id: "V", x: 0, y: 0, z: 0, length: 80 }, // collar shot, vertical: the note
    { hole_id: "S", x: 50, y: 0, z: 0, length: 90 }, // collar shot, -60, short: the note
    { hole_id: "L", x: 100, y: 0, z: 0, length: 400 }, // collar shot, -60, long: warned
    { hole_id: "P", x: 150, y: 0, z: 0, length: 111 }, // stations at 0 and 50 m: warned (#714)
    { hole_id: "D", x: 200, y: 0, z: 0, length: 500 }, // vertical, collar shot, deep: the note (vertical)
  ];
  const survey = [{ hole_id: "V", depth: 0, azimuth: 0, dip: -90 }, { hole_id: "S", depth: 0, azimuth: 90, dip: -60 }, { hole_id: "L", depth: 0, azimuth: 90, dip: -60 },
    { hole_id: "P", depth: 0, azimuth: 0, dip: -60 }, { hole_id: "P", depth: 50, azimuth: 0, dip: -60 }, { hole_id: "D", depth: 0, azimuth: 0, dip: 90 }];
  const iss = qc(collars, survey);
  assert.deepEqual(iss.filter((i) => /survey ends at/.test(i.message)).map((i) => i.holeId).sort(), ["L", "P"]);
  const note = iss.find((i) => /collar only/.test(i.message));
  assert.match(note.message, /^3 hole\(s\), 2 of them vertical, have a survey station at the collar only \(80-500 m deep\)/);
});

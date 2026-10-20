// TASKS.csv #714 — Data QC warns when a hole's survey stops well above its end (the trace below is a guess).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDataQC } from "../src/lib/dataQC.js";

const csv = (f) => {
  const [h, ...lines] = readFileSync(f, "utf8").trim().split(/\r?\n/);
  const keys = h.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], keys[i] === "hole_id" ? v : Number(v)])));
};
const shortIssues = (collars, survey) => runDataQC({ project: { epsg: 26910, name: "t" }, collars, survey, layers: {}, boundaries: [], assays: [] })
  .issues.filter((i) => /survey ends at/.test(i.message));

test("synthetic: over 30 m, or over 15 m and 20 %, is flagged; small gaps are not", () => {
  const collars = [{ hole_id: "A", x: 0, y: 0, z: 0, length: 111 }, { hole_id: "B", x: 9, y: 0, z: 0, length: 300 }, { hole_id: "C", x: 0, y: 9, z: 0, length: 100 }, { hole_id: "D", x: 9, y: 9, z: 0, length: 100 }];
  const survey = [{ hole_id: "A", depth: 0, azimuth: 0, dip: -60 }, { hole_id: "A", depth: 50, azimuth: 0, dip: -60 },
    { hole_id: "B", depth: 0, azimuth: 0, dip: -60 }, { hole_id: "B", depth: 270, azimuth: 0, dip: -60 }, // 30 m, 10 %: fine
    { hole_id: "C", depth: 0, azimuth: 0, dip: -60 }, { hole_id: "C", depth: 75, azimuth: 0, dip: -60 }, // 25 m, 25 %: flagged
    { hole_id: "D", depth: 0, azimuth: 0, dip: -60 }, { hole_id: "D", depth: 88, azimuth: 0, dip: -60 }]; // 12 m: fine
  const iss = shortIssues(collars, survey);
  assert.deepEqual(iss.map((i) => i.holeId), ["A", "C"]);
  assert.match(iss[0].message, /ends at 50 m, 61 m above the end of the hole \(111 m, 55%\)/);
});

test("Woodjam: the holes the review measured are flagged", () => {
  const iss = shortIssues(csv("sample_data/woodjam/collars.csv"), csv("sample_data/woodjam/survey.csv"));
  const ids = iss.map((i) => i.holeId);
  assert.ok(ids.includes("WJ23-105"), ids.join(","));
  assert.ok(ids.includes("DH23-109"), ids.join(","));
  assert.ok(!ids.includes("MT23-118") && !ids.includes("DH23-114"), ids.join(",")); // 22 m (5 %) and 21 m (10 %) gaps: fine
  console.log(`Woodjam: ${ids.length} hole(s) flagged: ${iss.map((i) => i.message.match(/ends at [^,]+, [\d.]+ m/)[0] + " " + i.holeId).join("; ")}`);
});

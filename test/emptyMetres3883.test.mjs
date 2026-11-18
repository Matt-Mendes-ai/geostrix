// TASKS.csv #3883 (#3815 (8)) — Sample along the drillholes says how many metres of the sampled holes had no point within reach and were left
// empty; a hole with no value at all is not counted (it is not one of 'those holes'). SYNTHETIC cloud and holes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleSurveyOnHoles } from "../src/lib/surveyOnHoles.js";

const cloud = [];
for (let x = 0; x <= 200; x += 25) for (let y = 0; y <= 200; y += 25) for (let z = 300; z <= 500; z += 25) cloud.push({ x, y, z, value: z / 10 });
const collars = [{ hole_id: "DH-23-001", x: 100, y: 100, z: 510, length: 400, azimuth: 0, dip: 90 }, { hole_id: "DH-23-002", x: 5000, y: 5000, z: 500, length: 100, azimuth: 0, dip: 90 }];

test("#3883 the metres of the sampled holes left empty (no point within reach); a hole never reached is not counted", () => {
  const r = sampleSurveyOnHoles({ points: cloud, collars, survey: [], desurveyMethod: "tangential", step: 5, maxDist: 20 });
  assert.equal(r.holes, 1);
  // midpoints below 280 m elevation (depth 230 m and down) are more than 20 m from the cloud's base at 300 m: 34 steps of 5 m
  assert.equal(r.emptyM, 170);
  assert.equal(sampleSurveyOnHoles({ points: cloud, collars: [collars[1]], survey: [], desurveyMethod: "tangential", step: 5, maxDist: 20 }).emptyM, 0);
});

test("#3883 the notice says it", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /\(res\.emptyM > 0 \? " " \+ tr\("\{m\} m of those holes had no point within \{d\} m and were left empty\.", \{ m: res\.emptyM\.toLocaleString\(\), d: maxDist \}\) : ""\)/);
});

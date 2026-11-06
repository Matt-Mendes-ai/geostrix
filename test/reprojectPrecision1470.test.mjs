// TASKS.csv #1470 — moving the project CRS rounded survey azimuths to 0.01 deg (278.43353 -> 278.43 on a NAD83 -> WGS 84 move that
// turns nothing), the warning did not say the terrain is re-sampled, and nothing said NAD83 -> WGS 84 applies no datum shift
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pointTransform, turnGridBearing, getProj4DefSync } from "../src/lib/reproject.js";
import { reprojectProject, nullDatumPair } from "../src/lib/projectReproject.js";

const collar = { hole_id: "SIL-1", x: 424918.4405, y: 6641913.808, z: 1500, azimuth: 278.43353, dip: -60, length: 400 };

test("a bearing keeps its precision: unchanged where grid north does not turn, not rounded to 0.01 where it does", () => {
  assert.equal(turnGridBearing(pointTransform(26909, 32609), collar.x, collar.y, 278.43353), 278.43353);
  const albers = turnGridBearing(pointTransform(26909, 3005), collar.x, collar.y, 278.43353);
  assert.ok(Math.abs(albers - 280.75) < 0.05, String(albers)); // the review's +2.32 deg
  assert.notEqual(Math.round(albers * 100) / 100, albers); // more than two decimals kept
  // there and back lands on the reading (to 1e-5 deg), not on a 0.01 grid
  const back = turnGridBearing(pointTransform(3005, 26909), ...pointTransform(26909, 3005)(collar.x, collar.y), albers);
  assert.ok(Math.abs(back - 278.43353) < 1e-5, String(back));
});

test("the project move: survey azimuths and the NAD83 / WGS 84 note", () => {
  const live = { collars: [collar], survey: [{ hole_id: "SIL-1", depth: 0, azimuth: 278.43353, dip: -60 }], project: { epsg: 26909 } };
  const r = reprojectProject(live, 26909, 32609);
  assert.equal(r.fields.survey[0].azimuth, 278.43353);
  assert.equal(r.fields.collars[0].azimuth, 278.43353);
  assert.ok(r.report.notes.some((n) => /NAD83 and WGS 84 are treated as the same datum/.test(n)));
  assert.ok(!reprojectProject(live, 26909, 3005).report.notes.some((n) => /same datum/.test(n)));
  // NAD83(CSRS) carries a real shift: no note
  assert.equal(nullDatumPair(getProj4DefSync(3156), getProj4DefSync(32609)), false);
  assert.equal(nullDatumPair(getProj4DefSync(4326), getProj4DefSync(4269)), true);
});

test("the confirm names the terrain as re-sampled", () => {
  const s = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8");
  assert.match(s, /moving back re-samples the terrain and raster images/);
});

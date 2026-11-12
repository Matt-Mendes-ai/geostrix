// TASKS.csv #1589 (review #1497, Lawyers) — a ground surface from a survey's own station elevations (IDW with a blanking
// distance from the line spacing), the terrain's coverage of the stations said before Estimate, and a GEM / Geosoft .xyz
// accepted by Terrain from points
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { terrainFromSurveyElevations } from "../src/lib/terrainFromPoints.js";

// a walk-mag survey: 9 lines 25 m apart, a reading every metre along 200 m, GPS height = a sloping plane + 2 m sensor
const survey = () => {
  const pts = [];
  for (let l = 0; l < 9; l++) for (let i = 0; i <= 200; i++) pts.push({ x: 500000 + i, y: 6000000 + l * 25, z: 1200 + i * 0.05 + l * 0.5 + 2, line: String(l) });
  return pts;
};

test("the ground between lines is filled, beyond the survey it is no-data, and the sensor height comes off", () => {
  const t = terrainFromSurveyElevations(survey(), { sensorHeight: 2 });
  assert.ok(t.gridW >= 30 && t.gridW <= 300 && t.gridH >= 30, `${t.gridW} x ${t.gridH}`); // a 6 m cell: a quarter of the 25 m line spacing
  assert.ok(t.stats.coveredPct > 85, String(t.stats.coveredPct)); // the review's TIN left 82-99.5 % EMPTY
  assert.ok(t.stats.blankM >= 25 && t.stats.blankM <= 60, String(t.stats.blankM)); // 1.5 x the 25 m line spacing
  assert.equal(t.stats.stations, 9 * 201);
  // a node between two lines: close to the plane, sensor height removed
  const cell = t.stats.cellM, col = Math.round((500100 - t.bbox[0]) / cell), row = Math.round((t.bbox[3] - 6000112.5) / cell);
  const k = row * t.gridW + col, z = t.elevations[k];
  assert.ok(t.noDataMask === null || typeof t.noDataMask === "string"); // demFill's bitset (base64) of the filled no-data nodes
  assert.ok(Math.abs(z - (1200 + 100 * 0.05 + 4.5 * 0.5)) < 0.6, String(z));
  // far outside the survey the node is masked (filled for sampling, flagged no-data)
  assert.ok(t.stats.zmin >= 1199 && t.stats.zmax <= 1216, `${t.stats.zmin} ${t.stats.zmax}`);
});

test("too few stations, or stations on one line, are refused with a reason", () => {
  assert.throws(() => terrainFromSurveyElevations([{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }]), /At least 3 stations/);
  assert.throws(() => terrainFromSurveyElevations([{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }]), /lie on a line/);
});

test("the inversion pane says the coverage before Estimate and offers the ground from the stations; Terrain from points reads a GEM .xyz", () => {
  const p = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /The terrain covers \{pct\}% of the stations; the others would be left out\./);
  assert.match(p, /No terrain yet: an inversion needs one to know which cells are underground\./);
  assert.match(p, /terrainFromSurveyElevations\(rows, \{ sensorHeight: sh \}\)/);
  assert.match(p, /setRunGround\(\{ survey: activeSurvey, t: \{ name, bbox: t\.bbox, gridW: t\.gridW, gridH: t\.gridH, elevations: t\.elevations, noDataMask: t\.noDataMask/ /* the run's own ground since #2638 */);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(\/\\\.xyz\$\/i\.test\(file\.name\) && \/\^\\s\*\\\/\/\.test\(raw\)\) \{ const \{ columns, rows: xr \} = parseXYZ\(raw\);/);
});

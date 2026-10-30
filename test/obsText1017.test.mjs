// TASKS.csv #1017 — the UBC-GIF observation file written beside an exported inversion model (modelExport.js obsText):
// magnetics = inducing field line (inclination, declination, strength nT), the anomaly projection line (same angles, 1 =
// total-field anomaly), the station count, then "x y z datum std" per station; gravity = the count then the stations.
import test from "node:test";
import assert from "node:assert/strict";
import { obsText } from "../src/lib/modelExport.js";

const d = { x: [612000.123, 612050], y: [5789000, 5789000.456], z: [1001.5, 1002], std: [2.5, 2.5] };

test("#1017 magnetic .obs: the two field lines, the count, then x y z datum std per station", () => {
  const txt = obsText("mag", d, [12.3456789, -4.2], { inclination: 72.5, declinationGrid: 17.25, strengthNT: 56789.1 });
  const lines = txt.trimEnd().split("\n");
  assert.deepEqual(lines.slice(0, 3), ["72.50 17.25 56789.10", "72.50 17.25 1", "2"]);
  assert.deepEqual(lines[3].split(" "), ["612000.12", "5789000.00", "1001.50", "12.34568", "2.5"]); // datum to 7 significant figures
  assert.equal(lines.length, 5);
  assert.ok(txt.endsWith("\n"));
});

test("#1017 gravity .obs: no field lines; a missing value is written as UBC no-data, not NaN", () => {
  const lines = obsText("grav", d, [0.125, NaN], null).trimEnd().split("\n");
  assert.equal(lines[0], "2");
  assert.equal(lines[1].split(" ")[3], "0.125");
  const nodata = lines[2].split(" ")[3];
  assert.equal(nodata, "-99999"); // UBC_NODATA
  assert.ok(lines.every((l) => !/undefined|NaN/.test(l)));
});

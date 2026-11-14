// TASKS.csv #3302 (from #3209) — a survey / collar / structure file read as true-north azimuths (a gyro, or a column saying so): the import
// dialog says the grid convergence at the project's collars before Import, so the turn the azimuths take is seen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { azimuthToGridOffset } from "../src/lib/azimuthRef.js";

test("the turn: true north east of grid north west of the zone's central meridian, west of it east of it, none on it", () => {
  assert.ok(azimuthToGridOffset("true", 350000, 6300000, 32609).offset > 2); // 'turned by +2.06°'
  assert.ok(azimuthToGridOffset("true", 650000, 6300000, 32609).offset < -2);
  assert.ok(Math.abs(azimuthToGridOffset("true", 500000, 6300000, 32609).offset) < 0.005);
});

test("the dialog says it under the north choice, at the collars' median, for true north only", () => {
  const s = fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /if \(modal\.azimuthRef !== "true" \|\| crsUnset \|\| !projectEpsg \|\| !\["collars", "survey", "structure"\]\.includes\(modal\.target\)\) return null;/);
  assert.match(s, /azimuthToGridOffset\("true", xs\[xs\.length >> 1\], ys\[ys\.length >> 1\], projectEpsg\)/);
  assert.ok(s.includes('"At the project\'s collars true north lies {deg}° east of grid north (the grid convergence): these azimuths are turned by +{deg}° to grid north."'));
});

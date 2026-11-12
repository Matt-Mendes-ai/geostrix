// TASKS.csv #2051 (review #2013, 3D Modelling) — the core-orientation calculator kept the previous hole's azimuth / dip for a hole with no
// survey, and listed all 544 collars (534 with no attitude).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holesWithAttitude } from "../src/lib/coreOrientation.js";
const c = readFileSync(new URL("../src/components/CoreOrientationCalculator.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("holes with a survey or a collar azimuth and dip are listed; district collars with neither are not", () => {
  const collars = [{ hole_id: "DH24-120" }, { hole_id: "SE10-01" }, { hole_id: "WJ99-23", azimuth: 90, dip: -60 }, { hole_id: "X", azimuth: "", dip: null }];
  const survey = [{ hole_id: "DH24-120", depth: 0, azimuth: 227, dip: -60 }];
  assert.deepEqual(holesWithAttitude(collars, survey).map((h) => h.hole_id), ["DH24-120", "WJ99-23"]);
});
test("no attitude at the depth: the fields are cleared and a note says so", () => {
  assert.match(c, /else \{ setAzimuth\(""\); setDip\(""\); setHoleNote\(tr\("No survey or collar azimuth \/ dip for \{hole\} at \{depth\} m/);
  assert.match(c, /\{shownHoles\.map\(\(c\) => <option key=\{c\.hole_id\}/); // #2540: the orientable holes, filtered by name
  assert.match(c, /const shownHoles = useMemo\(\(\) => \{[^\n]*orientable\.filter/);
});

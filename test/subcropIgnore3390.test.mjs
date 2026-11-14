// TASKS.csv #3390 (#3366) — a code set to 'ignore' in Modelling codes (what 'no recovery' maps to there) is skipped as cover by the subcrop, like overburden
// and no recovery. SYNTHETIC collar and log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { collarSubcrop, roleWithCodes } from "../src/lib/collarSubcrop.js";

const collars = [{ hole_id: "H1", x: 100, y: 200, z: 300, azimuth: 0, dip: 90, length: 50 }];
const litho = [{ hole_id: "H1", from: 0, to: 5, value: "NR" }, { hole_id: "H1", from: 5, to: 8, value: "ZZ9" }, { hole_id: "H1", from: 8, to: 50, value: "GRN" }];

test("a code the user set to ignore is cover, so the subcrop is the first unit under it", () => {
  const roleOf = roleWithCodes({ codes: [{ name: "ZZ9", role: "ignore" }] });
  assert.equal(roleOf("ZZ9"), "ignore");
  const [p] = collarSubcrop({ collars, survey: [], litho, roleOf });
  assert.equal(p.unit, "GRN"); assert.equal(p.cover, 8, "NR (by name) and ZZ9 (ignored) are both cover: 8 m");
});
test("without the role the code is a unit, as before", () => {
  const [p] = collarSubcrop({ collars, survey: [], litho });
  assert.equal(p.unit, "ZZ9");
});

// TASKS.csv #719 — structure dips get no sign convention: a negative dip is unknown (counted), not a mirrored plane.
import test from "node:test";
import assert from "node:assert/strict";
import { normStructure } from "../src/lib/viewer/importHelpers.js";

const mapping = { hole_id: "hole", depth: "depth", dip: "dip", azimuth: "az" };
test("structure import (no convention): -45 is unknown, 45 is kept", () => {
  assert.ok(Number.isNaN(normStructure({ hole: "A", depth: 10, dip: -45, az: 90 }, mapping, null, null).dip));
  assert.equal(normStructure({ hole: "A", depth: 10, dip: 45, az: 90 }, mapping, null, null).dip, 45);
  assert.ok(Number.isNaN(normStructure({ hole: "A", depth: 10, dip: 95, az: 90 }, mapping, null, null).dip));
});

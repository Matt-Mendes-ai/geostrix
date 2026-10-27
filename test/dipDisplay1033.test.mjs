// TASKS.csv #1033 (review #1016) — the stored positive-down dip is shown negative = down, as the import file wrote it.
import test from "node:test";
import assert from "node:assert/strict";
import { holeAtlasValues } from "../src/lib/atlas.js";

test("#1033 atlas: MT23-118 imported at -70 (stored 70) prints -70; an up-hole imported +20 (stored -20) prints 20; no dip prints ?", () => {
  const collars = [{ hole_id: "MT23-118", x: 1, y: 2, z: 3, azimuth: 90, dip: 70, length: 300 }, { hole_id: "UG-1", x: 1, y: 2, z: 3, azimuth: 0, dip: -20 }, { hole_id: "X", x: 1, y: 2, z: 3 }];
  assert.equal(holeAtlasValues("MT23-118", collars, {}).dip, "-70");
  assert.equal(holeAtlasValues("UG-1", collars, {}).dip, "20");
  assert.equal(holeAtlasValues("X", collars, {}).dip, "?");
});

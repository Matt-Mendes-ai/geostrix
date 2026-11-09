// TASKS.csv #2151 — collar files with Australian grid names (MGA_East / MGA_North, GDA94_E / GDA94_N, GBMG_East / GBMG_North, *_RL)
import test from "node:test";
import assert from "node:assert/strict";
import { guessTarget, guessTargetFor, guessMapping, gridCoordinateColumns } from "../src/lib/layers.js";

const FILES = [
  [["HoleID", "MGA_East", "MGA_North", "MGA_RL", "Dip", "Azimuth", "TD"], ["MGA_East", "MGA_North", "MGA_RL"]],
  [["HOLEID", "GDA94_E", "GDA94_N", "GDA94_RL", "EOH"], ["GDA94_E", "GDA94_N", "GDA94_RL"]],
  [["Hole_ID", "GBMG_East", "GBMG_North", "Orig_RL", "Max_Depth"], ["GBMG_East", "GBMG_North", "Orig_RL"]],
  [["HoleId", "AMG_E", "AMG_N", "RL", "Depth"], ["AMG_E", "AMG_N", "RL"]],
  [["HoleId", "Nat_East", "Nat_North", "Nat_RL"], ["Nat_East", "Nat_North", "Nat_RL"]],
];

test("each grid-named collar file is collars, mapped to its own grid columns", () => {
  for (const [h, [x, y, z]] of FILES) {
    assert.equal(guessTarget(h), "collars", h.join(","));
    assert.equal(guessTargetFor(h, "collars_wamex.csv"), "collars");
    const m = guessMapping("collars", h);
    assert.deepEqual([m.x, m.y, m.z], [x, y, z], h.join(","));
  }
});

test("TD is the hole length", () => {
  assert.equal(guessMapping("collars", FILES[0][0]).length, "TD");
});

test("MGA wins over a local grid in the same file; plain Easting / Northing keep priority", () => {
  const h = ["HoleID", "Local_E", "Local_N", "Local_RL", "MGA_E", "MGA_N", "MGA_RL"];
  const m = guessMapping("collars", h);
  assert.deepEqual([m.x, m.y, m.z], ["MGA_E", "MGA_N", "MGA_RL"]);
  assert.equal(gridCoordinateColumns(h)[0].prefix, "mga");
  const p = guessMapping("collars", ["HoleID", "Easting", "Northing", "Elevation", "Local_E", "Local_N"]);
  assert.deepEqual([p.x, p.y, p.z], ["Easting", "Northing", "Elevation"]);
});

test("no false collars: interval tables and unpaired names", () => {
  assert.notEqual(guessTarget(["HoleID", "From", "To", "MGA_E", "MGA_N", "MGA_RL"]), "collars");
  assert.equal(gridCoordinateColumns(["HoleID", "Elevation", "Dip_E", "Lith"]).length, 0);
  assert.equal(gridCoordinateColumns(["HoleID", "Line_E", "Station_N"]).length, 0, "the two halves must share a prefix");
});

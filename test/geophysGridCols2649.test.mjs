// TASKS.csv #2649 — the point-survey importer reads grid-named coordinate pairs (MGA_E / MGA_N, GDA94_East / GDA94_North, MGA_RL) as the
// collar import and Maps > A file do; plain X / Easting names still win
import test from "node:test";
import assert from "node:assert/strict";
import { guessGeophysColumns } from "../src/lib/geophysColumns.js";

test("#2649 grid-named pairs", () => {
  const a = guessGeophysColumns(["MGA_E", "MGA_N", "RL", "TMI"]);
  assert.deepEqual([a.x, a.y, a.z, a.value, a.ok], ["MGA_E", "MGA_N", "RL", "TMI", true]);
  const b = guessGeophysColumns(["MGA_East", "MGA_North", "MGA_RL", "Grav_mGal"]);
  assert.deepEqual([b.x, b.y, b.z, b.value, b.ok], ["MGA_East", "MGA_North", "MGA_RL", "Grav_mGal", true]);
  const c = guessGeophysColumns(["Line", "MGA_E", "MGA_N", "nT_tmi"]);
  assert.deepEqual([c.x, c.y, c.line, c.value], ["MGA_E", "MGA_N", "Line", "nT_tmi"]);
  const d = guessGeophysColumns(["GDA94_East", "GDA94_North", "Elev", "TMI"]);
  assert.deepEqual([d.x, d.y, d.z, d.value], ["GDA94_East", "GDA94_North", "Elev", "TMI"]);
});

test("#2649 plain names still win; a lone east column is not a pair", () => {
  const a = guessGeophysColumns(["X", "Y", "MGA_E", "MGA_N", "TMI"]);
  assert.deepEqual([a.x, a.y], ["X", "Y"]);
  const b = guessGeophysColumns(["Easting", "Northing", "mag"]);
  assert.deepEqual([b.x, b.y, b.value, b.ok], ["Easting", "Northing", "mag", true]);
  const c = guessGeophysColumns(["Dip_E", "Station_N", "TMI"]);
  assert.equal(c.ok, false); // not a pair with one prefix
});

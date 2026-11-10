// TASKS.csv #2564 (review #2486, WA lithium) — surface samples and outcrop structures with the company's own grid names (MGA_E / MGA_N / MGA_Z)
import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeSurfaceSamples, isSurfaceSampleTable, surfaceXYColumns } from "../src/lib/viewer/importHelpers.js";
import { guessStructureColumns } from "../src/lib/mapLayers.js";
import { gridCoordinateColumns } from "../src/lib/layers.js";

const chips = ["Sample_ID", "MGA_E", "MGA_N", "MGA_Z", "Sample_Type", "Li2O_pct", "Cs_ppm", "Ta_ppm"];
const rows = [{ Sample_ID: "R1", MGA_E: "413807", MGA_N: "6252885", MGA_Z: "312", Sample_Type: "rock chip", Li2O_pct: "1.747", Cs_ppm: "120", Ta_ppm: "45" }];

test("a rock-chip table on MGA_E / MGA_N / MGA_Z is surface samples, with its coordinates chosen", () => {
  assert.ok(isSurfaceSampleTable(chips));
  assert.ok(looksLikeSurfaceSamples(chips, rows));
  assert.deepEqual(surfaceXYColumns(chips), { x: "MGA_E", y: "MGA_N", z: "MGA_Z" });
  assert.deepEqual(surfaceXYColumns(["east", "north", "Au_ppb"]), { x: "east", y: "north", z: "" }); // the plain names still win
});

test("outcrop structures on MGA names pick them; plain names are unchanged; collars still detected by the shared detector", () => {
  const s = guessStructureColumns(["Station", "MGA_E", "MGA_N", "MGA_Z", "Dip", "Dip_Dir", "Type"]);
  assert.equal(s.x, "MGA_E"); assert.equal(s.y, "MGA_N"); assert.equal(s.z, "MGA_Z");
  assert.equal(guessStructureColumns(["Easting", "Northing", "Dip", "DipDir"]).x, "Easting");
  assert.equal(gridCoordinateColumns(["Hole_ID", "MGA_East", "MGA_North", "MGA_RL", "Depth"])[0].prefix, "mga");
});

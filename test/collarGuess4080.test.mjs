// TASKS.csv #4080 — a table is offered as collars only when it names its holes. An east / north / elevation trio alone is also an IP line's station coordinates, an inversion model's cells, a topography profile,
// a geochem or soil row's position: side 1's harvest of public reports read 43 such tables (inversion csv / xyz, CSAMT pseudo-sections, topo lines, IP stations) as collars; the one real collar table in it
// (a hole id, NZMG east / north, a collar elevation, total depth) must still be one. Synthetic headers of the same shapes (the real files are not in the repository).
import test from "node:test";
import assert from "node:assert/strict";
import { guessTarget, guessTargetFor, holeIdColumn, guessMapping } from "../src/lib/layersImport.js";

// the shapes of the false positives: columns only
const NOT_COLLARS = {
  "inversion model with a line and station": ["x", "y", "Z", "Resistivity", "Chargeability", "Conductivity", "line", "station"],
  "inversion model, bare": ["x", "y", "z", "Resistivity", "Chargeability", "Conductivity"],
  "inversion model with a misfit column": ["x", "y", "Z", "Resistivity", "Chargeability", "Conductivity", "MF"],
  "a 3D resistivity / IP model": ["X", "Y", "Z", "Rho", "IP"],
  "a topography profile along a line": ["X", "Y", "Z"],
  "CSAMT pseudo-section with stations": ["Station", "GridEast", "GridNorth", "Elevation", "ResInv", "Line"],
  "CSAMT pseudo-section without stations": ["GridEast", "GridNorth", "Elevation", "ResInv", "Line"],
  "IP line elevation coordinates": ["Label", "station", "Easting", "Northing", "Elevation"],
  "a soil sample row": ["Sample", "Easting", "Northing", "RL", "Au_ppb", "Cu_ppm"],
  "a geochem sample row with an id": ["SampleID", "East", "North", "Elev", "Cu", "Zn"],
  "a stream sediment row with a name": ["Name", "UTM_E", "UTM_N", "Elevation", "As_ppm"],
};

test("#4080 an east / north / elevation table with no hole id is not guessed as collars", () => {
  for (const [what, headers] of Object.entries(NOT_COLLARS)) {
    assert.notEqual(guessTarget(headers), "collars", what);
    assert.notEqual(guessTargetFor(headers, "file.csv"), "collars", `${what} (through guessTargetFor)`);
  }
});

test("#4080 a table that names its holes is still collars", () => {
  const COLLARS = {
    "hole_id, x, y, z": ["hole_id", "x", "y", "z"],
    "HoleID with easting / northing / RL": ["HoleID", "Easting", "Northing", "RL", "Azimuth", "Dip", "Depth"],
    "total_depth with azimuth and dip": ["hole_id", "x", "y", "z", "azimuth", "dip", "total_depth"],
    "BHID / UTM_E / UTM_N / Elev": ["BHID", "UTM_E", "UTM_N", "Elev", "EOH"],
    "DDH with Elevation": ["DDH", "East", "North", "Elevation"],
    "Drillhole_ID": ["Drillhole_ID", "Easting", "Northing", "Elevation"],
    "Hole Name with a space": ["Hole Name", "X", "Y", "Z"],
    "hole id with a grid's name (NZMG east / north)": ["dhid", "dheast", "dhnorth", "nzmg east", "nzmg north", "dhelev", "dhtd", "dhdate"],
    "MGA grid columns": ["Hole", "MGA_East", "MGA_North", "MGA_RL", "Depth"],
    "GSQ's SiteID": ["SiteID", "Easting", "Northing", "Elevation"],
    "a hole id the schema does not list (Well_ID, Trench_No, Collar_ID, BoreID)": ["Well_ID", "Easting", "Northing", "Elevation"],
  };
  for (const [what, headers] of Object.entries(COLLARS)) assert.equal(guessTarget(headers), "collars", what);
  for (const h of [["Trench_No", "Easting", "Northing", "Elevation"], ["Collar_ID", "X", "Y", "Z"], ["BoreID", "X", "Y", "Z"]]) assert.equal(guessTarget(h), "collars", h.join());
});

test("#4080 what counts as naming the hole: the schema's id, or a drilling word; not a plain Name, Label, ID, Station, Line or Sample", () => {
  for (const h of ["hole_id", "HoleID", "BHID", "DHID", "DDH", "Hole Name", "Drillhole_ID", "SiteID", "Well_ID", "Trench_No", "Collar_ID", "DH_ID", "RC_No", "Borehole"]) assert.ok(holeIdColumn([h, "x", "y", "z"]), h);
  for (const h of ["Name", "Label", "ID", "Station", "Line", "Sample", "SampleID", "Point", "Shot", "Pole"]) assert.equal(holeIdColumn([h, "x", "y", "z"]), "", h);
  assert.equal(holeIdColumn(["Hole_Type", "x", "y", "z"]), "", "Hole_Type is an attribute of a hole, not its id");
  assert.equal(holeIdColumn([]), "");
});

test("#4080 choosing Collars by hand still works: the mapping, with the east / north / elevation found and the hole id left to pick", () => {
  const m = guessMapping("collars", ["Label", "station", "Easting", "Northing", "Elevation"]);
  assert.equal(m.x, "Easting"); assert.equal(m.y, "Northing"); assert.equal(m.z, "Elevation");
  assert.ok(!m.hole_id || m.hole_id === "", "the hole id is the user's to choose");
});

test("#4080 a file named for collars is still collars when its headers allow it (the name hint is unchanged)", () => {
  assert.equal(guessTargetFor(["Hole", "Easting", "Northing", "RL"], "Collars.csv"), "collars");
  assert.equal(guessTargetFor(["Hole", "Easting", "Northing", "RL"], "headers.csv"), "collars");
});

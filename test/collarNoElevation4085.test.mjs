// TASKS.csv #4085 — a collar table with a hole id and X / Y but no elevation column was guessed as survey (an azimuth and a Maximum_Depth). It is collars now, placed on the
// terrain, or at an elevation the import dialog asks for when there is none. Synthetic headers and rows only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessTarget, guessTargetFor, guessMapping, schemaSatisfied } from "../src/lib/layersImport.js";
import { fillMissingCollarZ, zOptional } from "../src/lib/collarElevation.js";
import { needsTerrainZ } from "../src/lib/collarFromTerrain.js";

const NCT = ["Data_Set", "Hole_id", "Hole_Type", "Original_Grid", "Easting", "Northing", "Dip", "Azimuth", "Maximum_Depth", "Date_Drilled", "Rig", "Bit Type", "Drill Contractor"];
const rowsOf = (headers, list) => list.map((vals) => Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""])));

test("#4085 a collar table with no elevation (hole id, east, north, a hole-length depth) is collars, not survey", () => {
  assert.equal(guessTarget(NCT), "collars");
  const rows = rowsOf(NCT, [["DS1", "DH-23-001", "RC", "MGA94_55", "512000", "5830000", "-60", "90", "120"], ["DS1", "DH-23-002", "RC", "MGA94_55", "512100", "5830050", "-60", "90", "96"]]);
  assert.equal(guessTargetFor(NCT, "EL0000_Collars.txt", rows), "collars");
  const m = guessMapping("collars", NCT);
  assert.deepEqual([m.hole_id, m.x, m.y, m.z, m.length, m.azimuth, m.dip], ["Hole_id", "Easting", "Northing", "", "Maximum_Depth", "Azimuth", "Dip"]);
  assert.equal(zOptional("collars"), true, "the dialog lets it through without an elevation column");
  for (const h of [["HoleID", "X", "Y", "EOH"], ["BHID", "East", "North", "Total_Depth", "Azi", "Dip"], ["Hole_Name", "Easting", "Northing"], ["DDH", "UTM_E", "UTM_N", "TD"]]) assert.equal(guessTarget(h), "collars", h.join(","));
});

test("#4085 a plain Depth: one row per hole is a collar table, several stations per hole stay a survey", () => {
  const h = ["HoleID", "Easting", "Northing", "Depth", "Azimuth", "Dip"];
  assert.equal(guessTarget(h), "survey", "headers alone cannot tell: the rule before #4085 stands");
  const once = rowsOf(h, [["DH-1", "500000", "7000000", "150", "45", "-60"], ["DH-2", "500100", "7000000", "200", "45", "-60"], ["DH-3", "500200", "7000000", "90", "45", "-60"]]);
  assert.equal(guessTargetFor(h, "drilling.csv", once), "collars");
  const stations = rowsOf(h, [["DH-1", "500000", "7000000", "0", "45", "-60"], ["DH-1", "500010", "7000000", "50", "46", "-59"], ["DH-2", "500100", "7000000", "0", "45", "-60"]]);
  assert.equal(guessTargetFor(h, "drilling.csv", stations), "survey");
});

test("#4085 what stays as it was: surveys, logs, and #4080's tables without a hole id", () => {
  assert.equal(guessTarget(["HoleID", "Depth", "Azimuth", "Dip"]), "survey");
  assert.equal(guessTarget(["BHID", "AT", "BRG", "DIP"]), "survey");
  assert.equal(guessTarget(["HoleID", "From", "To", "Easting", "Northing", "Lith"]), "litho", "a from / to table is never collars");
  for (const h of [["Station", "Easting", "Northing"], ["Line", "X", "Y", "Depth", "Azimuth"], ["Sample", "Easting", "Northing", "Au"]]) assert.notEqual(guessTarget(h), "collars", h.join(","));
  assert.notEqual(guessTarget(["HoleID", "Easting", "Northing", "Depth_From", "Depth_To", "Au"]), "collars", "an interval table");
});

test("#4085 a file named for collars with no elevation column keeps the collar guess (the name hint)", () => {
  const h = ["HoleID", "Easting", "Northing", "Depth", "Azimuth", "Dip"];
  assert.equal(schemaSatisfied("collars", guessMapping("collars", h)), false, "elevation is a required field of the schema");
  assert.equal(guessTargetFor(h, "Drill collars.csv"), "collars");
});

test("#4085 the elevation: the terrain first, then the one typed in the dialog, then the median", () => {
  const rows = [{ hole_id: "A", x: 1, y: 1, z: NaN }, { hole_id: "B", x: 5, y: 5, z: NaN }];
  const ground = (x) => (x < 3 ? 310 : NaN);
  const out = fillMissingCollarZ(rows, { groundAt: ground, fixedZ: 250 });
  assert.deepEqual(out.rows.map((r) => [r.z, r.zAssumed]), [[310, "terrain"], [250, "fixed"]]);
  assert.deepEqual(out.counts, { terrain: 1, fixed: 1, median: 0, zero: 0, kept: 0 });
  const noFix = fillMissingCollarZ([{ hole_id: "C", x: 1, y: 1, z: NaN }], { existing: [{ hole_id: "P", z: 100 }] });
  assert.equal(noFix.rows[0].zAssumed, "median");
  assert.equal(needsTerrainZ({ hole_id: "B", x: 5, y: 5, z: 250, zAssumed: "fixed" }), true, "a typed elevation is offered the terrain when one is added");
});

test("#4085 the dialog asks for a fixed elevation when there is no terrain, and the import says how each collar was placed", () => {
  const c = readFileSync(new URL("../src/components/CollarElevationChoice.jsx", import.meta.url), "utf8");
  assert.match(c, /const fixedOn = !terrain && !!modal\.zFixedOn;/);
  assert.match(c, /<NumberInput allowEmpty value=\{modal\.zFixed \?\? null\} onChange=\{\(n\) => onChange\(\{ \.\.\.modal, zFixedOn: true, zFixed: n \}\)\}/);
  const p = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(p, /fixedZ: data\.zFixedOn && data\.zFixed != null && data\.zFixed !== "" && Number\.isFinite\(\+data\.zFixed\) \? \+data\.zFixed : null/);
  assert.match(p, /if \(zc\.fixed\) how\.push\(tr\("\{n\} at \{z\} m \(given\)"/);
  const g = readFileSync(new URL("../src/components/CollarZGate.jsx", import.meta.url), "utf8");
  assert.match(g, /c\.zAssumed === "fixed"/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.deepEqual(["A fixed elevation (m)", "Both flagged ASSUMED; the terrain is offered later.", "The median of the other collars", "{n} at {z} m (given)"].filter((k) => !j[k]), [], l);
  }
});

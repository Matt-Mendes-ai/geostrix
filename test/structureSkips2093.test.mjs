// TASKS.csv #2093 (review #2013) and #1826 (review #1646, Kodiak) — the structure import counts each skipped row by its reason, and picks the
// station column that is filled on the measured rows
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStructureRows, bestStationColumn, guessStructureColumns } from "../src/lib/mapLayers.js";

const cols = { x: "E", y: "N", dip: "Dip", dipDir: "DD", strike: "Strike" };
test("each skipped row has one reason", () => {
  const rows = [
    { E: 1, N: 2, Dip: 40, DD: 100 }, // kept
    { E: 1, N: 2, Dip: "", DD: "", Strike: "" }, // a sample with no structure
    { E: "", N: 2, Dip: 40, DD: 100 }, // no easting
    { E: 1, N: 2, Dip: "", Strike: 45 }, // a chip-line bearing
    { E: 1, N: 2, Dip: 95, DD: 10 }, // dip out of range
    { E: 1, N: 2, Dip: "steep", DD: 10 }, // dip not a number
    { E: 1, N: 2, Dip: 40, Strike: "N45E" }, // quadrant bearing
    { E: 1, N: 2, Dip: 40 }, // no direction
  ];
  const out = parseStructureRows(rows, cols);
  assert.equal(out.rows.length, 1);
  assert.equal(out.skipped, 7);
  assert.deepEqual(out.skipWhy, { noMeasurement: 1, noXY: 1, noDip: 1, badDip: 2, bearingUnread: 1, noDirection: 1 });
});

test("the Kodiak rock sheet: Sample_Number (filled on every measured row) over Waypoint (blank on them)", () => {
  const headers = ["Waypoint", "Sample_Number", "Easting", "Northing", "Dip", "Strike", "Structure"];
  const rows = [
    { Waypoint: "WP1", Sample_Number: "222144", Easting: 1, Northing: 2, Dip: "", Strike: "" },
    { Waypoint: "", Sample_Number: "222145", Easting: 1, Northing: 2, Dip: 60, Strike: 30 },
    { Waypoint: "", Sample_Number: "222146", Easting: 1, Northing: 2, Dip: 50, Strike: 20 },
  ];
  const g = guessStructureColumns(headers);
  assert.equal(g.station, "Waypoint");
  assert.equal(bestStationColumn(headers, rows, g), "Sample_Number");
  // a station filled everywhere keeps the name guess
  assert.equal(bestStationColumn(["Station", "Sample"], [{ Station: "S1", Sample: "A", Dip: 1 }], { station: "Station", dip: "Dip" }), "Station");
});

test("the panel uses them", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /cols\.station = bestStationColumn\(headers, res\.data, cols\);/);
  assert.match(p, /tr\(" Skipped \{skipped\} row\(s\): \{why\}\.", \{ skipped: out\.skipped, why: skipReasons\(out\.skipWhy(, out\.skipNames)?\) \}\)/); // skipNames: #2958 names the rows with no direction
});

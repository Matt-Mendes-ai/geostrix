// TASKS.csv #484 — point-survey CSV columns matched on the words in the headers, not exact names only.
import test from "node:test";
import assert from "node:assert/strict";
import { headerWords, guessGeophysColumns, rowsToGeophysPoints } from "../src/lib/geophysColumns.js";

const pick = (h) => { const g = guessGeophysColumns(h); return [g.x, g.y, g.z, g.value, g.ok]; };

test("#484 header words", () => {
  assert.deepEqual(headerWords("Raw_Mag_nT"), ["raw", "mag", "nt"]);
  assert.deepEqual(headerWords("EastingUTM"), ["easting", "utm"]);
  assert.deepEqual(headerWords("TMI (nT)"), ["tmi", "nt"]);
});

test("#484 the reported ground-mag export is recognised; ID, time and QC flag are not the value", () => {
  assert.deepEqual(pick(["Station_ID", "Easting_X", "Northing_Y", "Elevation_Z", "Time", "Raw_Mag_nT", "QC_Flag"]), ["Easting_X", "Northing_Y", "Elevation_Z", "Raw_Mag_nT", true]);
});

test("#484 exact names still work as before", () => {
  assert.deepEqual(pick(["x", "y", "z", "value"]), ["x", "y", "z", "value", true]);
  assert.deepEqual(pick(["Easting", "Northing", "Mag", "Label"]), ["Easting", "Northing", "", "Mag", true]);
  assert.equal(guessGeophysColumns(["Easting", "Northing", "Mag", "Label"]).label, "Label");
});

test("#484 a processed channel beats a raw one; line and fid found; altimeter is not an elevation", () => {
  const g = guessGeophysColumns(["LINE", "FID", "X", "Y", "RADAR", "GPS_ALT", "TMI_RAW", "TMI_LEV", "DIURNAL"]);
  assert.deepEqual([g.x, g.y, g.z, g.value, g.line, g.fid], ["X", "Y", "", "TMI_LEV", "LINE", "FID"]);
  assert.deepEqual(g.valueCandidates, ["TMI_RAW", "TMI_LEV"]);
  assert.equal(guessGeophysColumns(["EastingUTM", "NorthingUTM", "MagRaw", "MagCorrected", "BaseStation_nT"]).value, "MagCorrected");
});

test("#484 gravity and UTM_E/UTM_N; longitude/latitude flagged geographic, projected preferred", () => {
  assert.deepEqual(pick(["UTM_E", "UTM_N", "Elev", "Bouguer_2.67", "Stn"]), ["UTM_E", "UTM_N", "Elev", "Bouguer_2.67", true]);
  const ll = guessGeophysColumns(["Lat", "Lon", "K_pct", "eTh_ppm"]);
  assert.deepEqual([ll.x, ll.y, ll.value, ll.geographic], ["Lon", "Lat", "K_pct", true]);
  const both = guessGeophysColumns(["Easting", "Northing", "Lat", "Lon", "Mag"]);
  assert.deepEqual([both.x, both.y, both.geographic], ["Easting", "Northing", false]);
});

test("#484 not a point survey -> ok false (the caller opens the column picker)", () => {
  assert.equal(guessGeophysColumns(["Hole", "Depth", "Au"]).ok, false);
  assert.equal(guessGeophysColumns([]).ok, false);
});

test("#484 rows to points: numbers, blank z -> null, line / fid kept", () => {
  const cols = { x: "Easting_X", y: "Northing_Y", z: "Elevation_Z", value: "Raw_Mag_nT", line: "L", fid: "" };
  const pts = rowsToGeophysPoints([
    { Easting_X: "500010.5", Northing_Y: 6250000, Elevation_Z: "", Raw_Mag_nT: "57012.3", L: "10" },
    { Easting_X: 500020, Northing_Y: 6250000, Elevation_Z: 1012, Raw_Mag_nT: "x" },
  ], cols);
  assert.deepEqual(pts[0], { x: 500010.5, y: 6250000, z: null, value: 57012.3, label: undefined, line: "10" });
  assert.equal(pts[1].z, 1012);
  assert.ok(Number.isNaN(pts[1].value));
});

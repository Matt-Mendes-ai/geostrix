// TASKS.csv #2081 — the n = 1 stations file (LINE, STN, GRID_X, GRID_Y, MX_mVV, RHO_ohmm) was imported on RHO alone; MX, the IP product, was
// dropped with no picker. Other kinds of measurement now open the column picker, each ticked column its own survey.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { otherMeasurementColumns, channelMethods } from "../src/lib/radiometricChannels.js";
import { guessGeophysColumns } from "../src/lib/geophysColumns.js";

const headers = ["LINE", "STN", "GRID_X", "GRID_Y", "MX_mVV", "RHO_ohmm"];
const rows = [{ LINE: "3050E", STN: "100", GRID_X: "613000", GRID_Y: "5781400", MX_mVV: "12.4", RHO_ohmm: "310" }, { LINE: "3050E", STN: "125", GRID_X: "613000", GRID_Y: "5781425", MX_mVV: "*", RHO_ohmm: "295" }, { LINE: "3050E", STN: "150", GRID_X: "613000", GRID_Y: "5781450", MX_mVV: "9.8", RHO_ohmm: "280" }];

test("MX beside RHO is another measurement; coordinates, line and station are not", () => {
  const cols = guessGeophysColumns(headers);
  assert.equal(cols.value, "RHO_ohmm");
  // a column counts as numbers when 90 % of its filled cells are: 2 of 3 here (one '*') is not; with the '*' read as a blank it is
  assert.deepEqual(otherMeasurementColumns(headers, rows, cols), []);
  assert.deepEqual(otherMeasurementColumns(headers, rows.map((r) => ({ ...r, MX_mVV: r.MX_mVV === "*" ? "" : r.MX_mVV })), cols), ["MX_mVV"]);
  assert.deepEqual(channelMethods(["RHO_ohmm", "MX_mVV", "Note"]), [{ col: "RHO_ohmm", method: "res" }, { col: "MX_mVV", method: "ip" }, { col: "Note", method: null }]);
});

test("one kind of measurement (raw and corrected TMI) opens no picker", () => {
  const h = ["X", "Y", "TMI_raw", "TMI_corr"], r = [{ X: "1", Y: "2", TMI_raw: "57400", TMI_corr: "57390" }];
  assert.deepEqual(otherMeasurementColumns(h, r, guessGeophysColumns(h)), []);
});

test("the import opens the picker with each measurement as a channel, and channels with no known method get none", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const more = otherMeasurementColumns\(res\.meta\.fields \|\| \[\], res\.data, cols\); if \(more\.length\)/);
  assert.match(src, /\.\.\.tickedChannels\(xyzPending\.channels, xyzPending\.channelPick\)\.map/); // #2840: every ticked column with its own method (channelMethods)
  assert.match(src, /if \(j\.method && SURVEY_METHODS\[j\.method\] && !geophysSurveys\[j\.src\]\?\.method\)/);
});

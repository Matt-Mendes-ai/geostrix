// TASKS.csv #1442 — an outcrop file's station column is kept and exported
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessStructureColumns, parseStructureRows } from "../src/lib/mapLayers.js";

test("Station is guessed, kept on each row, and absent when the file has none", () => {
  const headers = ["Station", "Easting", "Northing", "Dip", "Dip Direction", "Type"];
  const cols = guessStructureColumns(headers);
  assert.equal(cols.station, "Station");
  const raw = [{ Station: "MM-24-017", Easting: "425100", Northing: "6642300", Dip: "35", "Dip Direction": "120", Type: "bedding" }];
  assert.equal(parseStructureRows(raw, cols).rows[0].station, "MM-24-017");
  const none = guessStructureColumns(["X", "Y", "Dip", "Dip dir"]);
  assert.equal(none.station, null);
  assert.ok(!("station" in parseStructureRows([{ X: "1", Y: "2", Dip: "10", "Dip dir": "90" }], none).rows[0]));
});

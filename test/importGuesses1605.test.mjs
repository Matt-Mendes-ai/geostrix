// TASKS.csv #1605 / #1510 (review #1497, Lawyers) — outcrop columns: a confidence code is not the dip; e_utm / n_utm are the
// coordinates; the drill assay import knows samp_num as the sample ID
import test from "node:test";
import assert from "node:assert/strict";
import { guessStructureColumns } from "../src/lib/mapLayers.js";
import { qcColumns } from "../src/lib/assayQcColumns.js";

test("Lawyers' rock-station headers: dip1 / strike1 / dip_dir1, not their confidence columns; e_utm / n_utm as X / Y", () => {
  const g = guessStructureColumns(["station", "e_utm", "n_utm", "elev_m", "strike1_conf", "dip1_conf", "strike1", "dip1", "dip_dir1"]);
  assert.deepEqual([g.x, g.y, g.z, g.strike, g.dip, g.dipDir, g.station], ["e_utm", "n_utm", "elev_m", "strike1", "dip1", "dip_dir1", "station"]);
});

test("a file with only confidence columns leaves Dip and Strike unmapped; plain names still win", () => {
  const g = guessStructureColumns(["x", "y", "dip_conf", "strike_conf"]);
  assert.equal(g.dip, null);
  assert.equal(g.strike, null);
  assert.equal(guessStructureColumns(["Easting", "Northing", "Dip", "Dip direction"]).dip, "Dip");
});

test("the drill assay import takes samp_num as the sample ID", () => {
  assert.equal(qcColumns(["hole_id", "from_m", "to_m", "samp_num", "type", "au_ppm"]).sample_id, "samp_num");
});

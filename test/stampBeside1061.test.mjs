// TASKS.csv #1061 (review #1016) — the block-model CSV's provenance can go beside it (a .zip: clean CSV + _provenance.txt).
import test from "node:test";
import assert from "node:assert/strict";
import { stampBeside, stampPlacement, stampLines } from "../src/lib/provenance.js";
import { buildZip, readZipEntries } from "../src/lib/shapefile.js";

test("#1061 automatic: beside for Micromine names, in the file for Datamine names; an explicit choice wins", () => {
  assert.equal(stampPlacement("auto", "micromine"), "beside");
  assert.equal(stampPlacement("auto", "datamine"), "inline");
  assert.equal(stampPlacement("inline", "micromine"), "inline");
  assert.equal(stampPlacement("beside", "datamine"), "beside");
});

test("#1061 the zip holds the CSV starting at its header and the notes in a text file", async () => {
  const csv = "EAST,NORTH,RL,_EAST,_NORTH,_RL,Au_ppm\r\n500000,6000000,900,10,10,5,1.2";
  const lines = stampLines({ tool: "Block model export", version: "0.1.75", epsg: 26910, params: ["Values: Au_ppm in ppm", "searchRadius: 100"] });
  const enc = new TextEncoder(), dec = new TextDecoder();
  const zip = buildZip(stampBeside(csv, lines, "Au IDW").map((f) => ({ name: f.name, data: enc.encode(f.text) })));
  const z = await readZipEntries(zip, /./);
  assert.equal(dec.decode(z["Au IDW.csv"]), csv);
  const notes = dec.decode(z["Au IDW_provenance.txt"]);
  assert.match(notes, /not a Mineral Resource/); assert.match(notes, /Project CRS: EPSG:26910/); assert.ok(!notes.includes("# "));
});

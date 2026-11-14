// TASKS.csv #2899 (review #2876, WA bedded iron) — eight files dropped at once: the 98 water bores were asked before the 6,292 drill collars
// (and set the CRS question), and the queued survey lost the instrument field the single-file dialog pre-adds (#2187).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderImportFiles } from "../src/lib/viewer/importHelpers.js";

const fakeFile = (name, header, size) => ({ name, size, slice: () => ({ text: async () => `${header}\n` }) });

test("collar files first, the biggest of them leading; then surveys; the rest in drop order", async () => {
  const files = [
    fakeFile("assays.csv", "Hole_id,Depth From,Depth To,Fe_XRF_pct", 26236317),
    fakeFile("bores.csv", "Hole_id,GDA94_E,GDA94_N,Elevation,Dip,Azimuth_mag", 7627),
    fakeFile("collars.csv", "Hole_ID,Easting,Northing,Elevation,Dip,Azimuth_TRUE", 444181),
    fakeFile("survey.csv", "Hole_id,Depth,Azimuth,Dip", 4404724),
    fakeFile("geology.csv", "Hole_id,Depth From,Depth To,Logged_Strand", 13729000),
  ];
  const order = (await orderImportFiles(files)).map((f) => f.name);
  assert.deepEqual(order.slice(0, 3), ["collars.csv", "bores.csv", "survey.csv"]);
});

test("a queued survey opens with the same pre-added method field as one dropped alone", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.ok(u.includes(`const modalData = { ...(codeGuess ? { valueGuess: codeGuess } : {}), ...(target === "survey" ? { customFields: surveyMethodFields(headers, data) } : target === "magsusc" ? { customFields: suscInstrumentFields(headers, data) } /* #2668 */ : {}),`));
});

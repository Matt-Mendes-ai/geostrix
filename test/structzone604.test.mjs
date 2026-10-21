// TASKS.csv #604 — structure logged by interval imports as a layer of structural zones (Matt, 2026-10-21)
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessTargetFor, guessMapping, LAYER_META, colorForStructZone } from "../src/lib/layers.js";
import { normInterval } from "../src/lib/viewer/importHelpers.js";

// headers of the real ARIS files: 43020Z Copley 2023 and 41597Z Woodjam 2023
const COPLEY = ["HOLEID", "PROJECTCODE", "GEOLFROM", "GEOLTO", "Struc_Code", "Struc_Intensity", "Struc_Alpha", "Struc_Desc"];
const WOODJAM_INT = ["Hole number", "From", "To", "Length", "Structure_Type", "Structure_Int", "Structure_Shape", "Structure_Roughness", "Fill_Type", "Alpha", "Beta", "Gamma", "Fault_Movement", "Comments"];
const WOODJAM_EVENT = ["Hole number", "Depth", "Structure_Type", "Thickness_mm", "Structure_Int", "Structure_Shape", "Structure_Roughness", "Fill_Type", "Alpha", "Beta", "Gamma", "Fault_Movement", "Comments"];

test("#604 interval structure logs are structural zones; point logs stay structure picks", () => {
  assert.equal(guessTargetFor(COPLEY, "Copley_2023_DH_Structure.csv"), "structzone"); // was lithology
  assert.equal(guessTargetFor(WOODJAM_INT, "Diamond Drilling_Downhole Structure Interval Log.csv"), "structzone"); // was structure, with no depth
  assert.equal(guessTargetFor(WOODJAM_EVENT, "Diamond Drilling_Downhole Structure Event Log.csv"), "structure");
  assert.equal(guessTargetFor(["hole_id", "depth_m", "structure_type", "alpha", "beta"], "structure.csv"), "structure");
  assert.equal(guessTargetFor(["hole_id", "from", "to", "type"], "vein.csv"), "vein");
  assert.equal(LAYER_META.structzone.kind, "interval");
});

test("#604 every column maps, and intensity / alpha / description are kept on the row", () => {
  const m = guessMapping("structzone", COPLEY);
  assert.deepEqual(m, { hole_id: "HOLEID", from: "GEOLFROM", to: "GEOLTO", value: "Struc_Code", description: "Struc_Desc", intensity: "Struc_Intensity", alpha: "Struc_Alpha" });
  const row = normInterval({ HOLEID: "COP-23-0001", PROJECTCODE: "Copley", GEOLFROM: "17.8", GEOLTO: "18.55", Struc_Code: "FL", Struc_Intensity: "3", Struc_Alpha: "60", Struc_Desc: "Strongly clay altered fault seam" }, m);
  assert.equal(row.value, "FL"); assert.equal(row.from, 17.8); assert.equal(row.to, 18.55);
  assert.equal(row.intensity, "3"); assert.equal(row.alpha, 60); assert.match(row.description, /fault seam/);
  const w = guessMapping("structzone", WOODJAM_INT);
  assert.equal(w.intensity, "Structure_Int"); assert.equal(w.value, "Structure_Type"); assert.equal(w.alpha, "Alpha");
  const wr = normInterval({ "Hole number": "MT23-118", From: "181.9", To: "182.9", Structure_Type: "FLTBX", Structure_Int: "M", Alpha: "" }, w);
  assert.equal(wr.intensity, "M"); // letters kept, not lost to a number
  assert.ok(!Number.isFinite(wr.alpha)); // blank alpha stays missing
  assert.equal(colorForStructZone("FLTBX"), "#8e1f16");
});

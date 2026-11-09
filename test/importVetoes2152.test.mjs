// TASKS.csv #2152 (WA drillhole review) — a comment, nominal, planned, reference or regolith-boundary column never wins a numeric field,
// and a hole attribute (type, status, parent, purpose, path, diameter) never wins the Hole ID.
import test from "node:test";
import assert from "node:assert/strict";
import { guessMapping } from "../src/lib/layers.js";

const pick = (t, h, keys) => { const m = guessMapping(t, h); return Object.fromEntries(keys.map((k) => [k, m[k]])); };

test("#2152 Hole ID: Hole_Type / Hole_Status / Parent_Hole_ID give way to HoleNo / Hole_Name", () => {
  assert.equal(pick("collars", ["Hole_Type", "Hole_Status", "HoleNo", "MGA_East", "MGA_North", "RL"], ["hole_id"]).hole_id, "HoleNo");
  assert.equal(pick("collars", ["Parent_Hole_ID", "Hole_Name", "Easting", "Northing", "RL"], ["hole_id"]).hole_id, "Hole_Name");
  assert.equal(pick("litho", ["Hole_Purpose", "Hole_Diameter", "DHID", "From", "To", "Lith"], ["hole_id"]).hole_id, "DHID");
  assert.equal(pick("collars", ["Hole_Type", "Easting", "Northing", "RL"], ["hole_id"]).hole_id, ""); // nothing else: left for the user
  assert.equal(pick("collars", ["Hole_ID", "Hole_Type", "Easting", "Northing", "RL"], ["hole_id"]).hole_id, "Hole_ID"); // unchanged
});

test("#2152 collar length / azimuth / dip: not a planned, nominal, reference or regolith-boundary column", () => {
  assert.equal(pick("collars", ["Hole_ID", "E", "N", "RL", "Precollar_Depth", "Depth_m"], ["length"]).length, "Depth_m");
  assert.equal(pick("collars", ["Hole_ID", "E", "N", "RL", "BOCO_Depth", "TOFR_Depth", "Water_Depth"], ["length"]).length, "");
  assert.deepEqual(pick("collars", ["Hole", "Easting", "Northing", "RL", "Nominal_Azimuth", "Nominal_Dip", "Total_Depth"], ["azimuth", "dip", "length"]), { azimuth: "", dip: "", length: "Total_Depth" });
  assert.equal(pick("collars", ["Hole_ID", "Easting", "Northing", "RL", "Azimuth_Ref", "Azimuth"], ["azimuth"]).azimuth, "Azimuth");
  assert.equal(pick("collars", ["Hole_ID", "Easting", "Northing", "RL", "Planned_Depth", "Final_Depth"], ["length"]).length, "Final_Depth");
  assert.equal(pick("survey", ["Hole_ID", "Precollar_Depth", "Depth_m", "Azimuth", "Dip"], ["depth"]).depth, "Depth_m");
  // the ordinary names still win as before
  assert.deepEqual(pick("collars", ["hole_id", "x", "y", "z", "azimuth", "dip", "length"], ["azimuth", "dip", "length"]), { azimuth: "azimuth", dip: "dip", length: "length" });
});

test("#2152 a numeric layer's value: not a comment column (Cmnts_Core_Recovery)", () => {
  assert.equal(pick("recovery", ["Hole_ID", "From", "To", "Cmnts_Core_Recovery", "Core_Rec_Pct"], ["value"]).value, "Core_Rec_Pct");
  assert.equal(pick("recovery", ["Hole_ID", "From", "To", "Cmnts_Core_Recovery"], ["value"]).value, "");
  assert.equal(pick("recovery", ["Hole_ID", "From", "To", "Recovery_Pct"], ["value"]).value, "Recovery_Pct");
});

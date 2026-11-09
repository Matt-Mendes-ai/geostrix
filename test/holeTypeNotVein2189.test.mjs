// TASKS.csv #2189 — a hole / drilling type anywhere in a column name is not a vein type (WAMEX dsHoleType), and such a table is a custom layer
import test from "node:test";
import assert from "node:assert/strict";
import { guessTarget, guessTargetFor } from "../src/lib/layers.js";

test("dsHoleType, DrillType, Rig_Type tables are custom layers, not Veins", () => {
  const dd = ["HOLEID", "GEOLFROM", "GEOLTO", "PROJECTCODE", "PROSPECT", "TENEMENTID", "dsHoleType"];
  assert.equal(guessTarget(dd), "custom");
  assert.equal(guessTargetFor(dd, "drilldetail_wallaby.csv"), "custom");
  assert.equal(guessTarget(["HoleID", "From", "To", "DH_DrillType"]), "custom");
  assert.equal(guessTarget(["HoleID", "From", "To", "Rig_Type"]), "custom");
});

test("vein and lithology logs keep their layers", () => {
  assert.equal(guessTarget(["hole_id", "from", "to", "type"]), "vein");
  assert.equal(guessTarget(["HoleID", "From", "To", "Vein_Type"]), "vein");
  assert.equal(guessTarget(["HoleID", "From", "To", "Lith_Code", "Hole_Type"]), "litho");
  assert.equal(guessTarget(["HoleID", "From", "To", "Hole_Type", "Rock"]), "litho");
  assert.equal(guessTarget(["HoleID", "From", "To", "Lith"]), "litho");
});

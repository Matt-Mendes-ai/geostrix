// TASKS.csv #2150 — a gold assay table with SAMPFROM / SAMPTO / SAMPLETYPE (WAMEX gold_small assays_1) is an assay table, and a
// sample-type column or element columns never send a file to Veins through the bare "type" rule
import test from "node:test";
import assert from "node:assert/strict";
import { guessTarget, guessTargetFor } from "../src/lib/layers.js";
import { looksLikeAssay } from "../src/lib/viewer/importHelpers.js";

const GOLD = ["HOLEID", "SAMPLEID", "SAMPFROM", "SAMPTO", "SAMPLETYPE", "Au", "AuRp1", "Au1"];

test("SAMPFROM / SAMPTO count as from / to for the assay check", () => {
  assert.equal(looksLikeAssay(GOLD, "assays_1.csv"), true);
  assert.equal(looksLikeAssay(["HoleID", "Samp_From", "Samp_To", "Sample_ID", "Au_ppm"], "x.csv"), true);
  assert.equal(looksLikeAssay(["HoleID", "Interval_From", "Interval_To", "SampleNo", "Cu_pct"], "x.csv"), true);
  assert.equal(looksLikeAssay(["HoleID", "GeolFrom", "GeolTo", "Lith"], "x.csv"), false, "no element column: not assays");
});

test("a sample-type column is not a vein type", () => {
  assert.notEqual(guessTarget(GOLD), "vein");
  assert.notEqual(guessTargetFor(GOLD, "assays_1.csv"), "vein");
  assert.notEqual(guessTarget(["HoleID", "From", "To", "Sample_Type", "Au_ppm"]), "vein");
  assert.notEqual(guessTarget(["HoleID", "From", "To", "Type", "Au_ppm", "Cu_ppm"]), "vein", "element columns: not a vein log");
});

test("a real vein log still goes to Veins", () => {
  assert.equal(guessTarget(["hole_id", "from", "to", "type"]), "vein");
  assert.equal(guessTarget(["HoleID", "From", "To", "Vein_Type", "Width_cm"]), "vein");
  assert.equal(guessTargetFor(["hole_id", "from", "to", "type"], "veins.csv"), "vein");
});

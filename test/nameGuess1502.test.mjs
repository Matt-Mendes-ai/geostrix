// TASKS.csv #1502 (from the #1497 review on Lawyers, 40958Z) — a log's file name is the stronger hint for its layer. Mineralization.csv with
// only a Description column went to Lithology (whose aliases include "description"); Oxidation, Silicification and OriCore, which have no
// built-in layer, were all guessed as Lithology too. The review's own files are not on this computer: headers shaped like them.
import test from "node:test";
import assert from "node:assert/strict";
import { guessTargetFor, guessMapping, schemaSatisfied } from "../src/lib/layers.js";

const H = (s) => s.split(",");

test("a file shaped like the named layer keeps it, its unknown value column left for the dialog", () => {
  assert.equal(guessTargetFor(H("HoleID,From,To,Description"), "Mineralization.csv"), "mnlgy");
  assert.equal(guessTargetFor(H("HoleID,From,To,Description"), "Vein Interval.csv"), "vein");
  assert.equal(guessTargetFor(H("HoleID,From,To,Description"), "alteration.csv"), "alt");
  // never committed unseen: the value is missing, so the folder queue's confident check fails and the dialog opens
  assert.equal(schemaSatisfied("mnlgy", guessMapping("mnlgy", H("HoleID,From,To,Description"))), false);
});

test("logs with no built-in layer ask, as a custom layer", () => {
  assert.equal(guessTargetFor(H("HoleID,From,To,Code,Description"), "Oxidation.csv"), "weath"); // #2162
  assert.equal(guessTargetFor(H("HoleID,From,To,Code,Description"), "weathering_log.csv"), "weath"); // #2162: weathering has its own layer now
  assert.equal(guessTargetFor(H("HoleID,From,To,Intensity,Comments"), "Silicification.csv"), "custom");
  assert.equal(guessTargetFor(H("HoleID,From,To,Quality,Comments"), "OriCore.csv"), "custom");
  assert.equal(guessTargetFor(H("HoleID,From,To,Quality"), "oriented_core.csv"), "custom");
  assert.equal(guessTargetFor(H("HoleID,From,To,Type"), "Voids.csv"), "custom"); // #600 still
});

test("what already worked is unchanged", () => {
  assert.equal(guessTargetFor(H("HoleID,From,To,Min1_Code,Min1_Pct"), "Mineralization.csv"), "mnlgy");
  assert.equal(guessTargetFor(H("HoleID,From,To,Lith_Code,Description"), "Lithology.csv"), "litho");
  assert.equal(guessTargetFor(H("HoleID,Depth,Alpha,Beta,Type"), "Structure orientations.csv"), "structure");
  assert.equal(guessTargetFor(H("HoleID,Easting,Northing,Elevation"), "collars.csv"), "collars");
  assert.equal(guessTargetFor(H("HoleID,From,To,Mineral"), "Iron oxides.csv"), "mnlgy", "an oxide mineral log is not an oxidation log");
  assert.equal(guessTargetFor(H("HoleID,From,To,Lith_Code"), "drill_log.csv"), "litho", "no hint: the headers decide");
  // a name hint the file is not shaped like (no hole or depths) falls back to the headers
  assert.notEqual(guessTargetFor(H("Code,Name"), "Mineral list.csv"), "mnlgy");
});

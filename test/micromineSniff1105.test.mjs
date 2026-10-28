// TASKS.csv #1105 — a Micromine DHASSAY with one or two elements is assays; HOLEID,DIST,AZIMUTH,DIP is a survey
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAssay } from "../src/lib/viewer/importHelpers.js";
import { guessTargetFor } from "../src/lib/layers.js";

test("#1105 gold-project assay tables with fewer than four elements are assays", () => {
  assert.equal(looksLikeAssay(["HOLE", "FROM", "TO", "SAMPLE", "AU", "CU"]), true);
  assert.equal(looksLikeAssay(["HOLE", "FROM", "TO", "SAMPLE", "Au_ppm", "Cu_pct"]), true);
  assert.equal(looksLikeAssay(["HOLE", "FROM", "TO", "AU"], "DHASSAY.csv"), true); // no sample id, but the name says so
  assert.equal(looksLikeAssay(["HOLE", "FROM", "TO", "SAMPLE", "AU_PPM", "CU_PCT", "AG_PPM", "AS_PPM"]), true);
});

test("#1105 logging tables are not taken for assays", () => {
  assert.equal(looksLikeAssay(["HOLE", "FROM", "TO", "LITH", "COMMENTS"]), false);
  assert.equal(looksLikeAssay(["HOLE", "FROM", "TO", "SAMPLE", "LITH"]), false); // no element column
  assert.equal(looksLikeAssay(["HOLE", "FROM", "TO", "CU"], "litho.csv"), false); // one element-like column, no sample id, no "assay" name
});

test("#1105 Micromine survey HOLEID, DIST, AZIMUTH, DIP is a survey", () => {
  assert.equal(guessTargetFor(["HOLEID", "DIST", "AZIMUTH", "DIP"], "survey.csv"), "survey");
  assert.equal(guessTargetFor(["HOLEID", "DIST", "AZIMUTH", "DIP"], "DHSURV.csv"), "survey");
});

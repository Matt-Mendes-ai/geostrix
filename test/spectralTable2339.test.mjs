// TASKS.csv #2339 (review #2325, WA uranium) — a hyperspectral (TSA) mineral table is not an assay table: a custom layer of its dominant mineral
import test from "node:test";
import assert from "node:assert/strict";
import { guessTargetFor, guessMapping, spectralColumns } from "../src/lib/layers.js";
import { looksLikeAssay } from "../src/lib/viewer/importHelpers.js";

// geophysics_1.csv's columns, as the review lists them
const H = ["Sample_ID", "HoleID", "From", "To", "mid_x", "mid_y", "mid_z", "U3O8_ppm", "Silicate", "Oxide", "TSA_S Mineral1", "TSA_S Weight1", "TSA_S Mineral2", "TSA_S Weight2", "TSA_S Error", "w2200", "d2200", "hqd2200", "w2350", "d2350", "kaol_cryst", "FeOx_index", "w900", "d900", "TSA_V Mineral1", "TSA_V Weight1"];
const rows = Array.from({ length: 20 }, (_, i) => Object.fromEntries(H.map((h) => [h, /Mineral/.test(h) ? ["Kaolinite", "Siderite", "Opal"][i % 3] : /Sample|Hole/.test(h) ? `S${i}` : String(i + 1)])));

test("the TSA table: not assays, a custom layer of TSA_S Mineral1", () => {
  assert.ok(spectralColumns(H) >= 10);
  assert.equal(looksLikeAssay(H, "geophysics_1.csv", rows), false);
  assert.equal(guessTargetFor(H, "geophysics_1.csv"), "custom");
  assert.equal(guessMapping("custom", H).value, "TSA_S Mineral1");
});

test("assay tables are untouched", () => {
  const A = ["HoleID", "From", "To", "SampleID", "Au_ppm", "Cu_ppm", "Pb_ppm", "Zn_ppm", "Ag_ppm", "As_ppm"];
  const ar = Array.from({ length: 5 }, (_, i) => Object.fromEntries(A.map((h) => [h, /ID/.test(h) ? `X${i}` : String(i + 1)])));
  assert.equal(spectralColumns(A), 0);
  assert.equal(looksLikeAssay(A, "assays.csv", ar), true);
  // a sulphide mineral log stays Mineralization
  assert.equal(guessTargetFor(["HoleID", "From", "To", "Min1_Code", "Min1_Pct"], "minerals.csv"), "mnlgy");
});

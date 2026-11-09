// TASKS.csv #2185 (review #2174, WA gold) — a hyperspectral mineral table (P_TSA_A_Mineral1 = IntChlorite) is not phosphorus assays
import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeAssay, columnHasNumbers } from "../src/lib/viewer/importHelpers.js";
import { pickElementColumns } from "../src/lib/geochem.js";

const H = ["HOLEID", "SAMPFROM", "SAMPTO", "SAMPLEID", "PROJECTCODE", "SAMPLETYPE", "P_TSA_A_Mineral1", "P_TSA_A_Weight1", "P_TSA_A_Mineral2", "P_TSA_A_Weight2", "P_TSA_A_Error"];
const rows = [{ P_TSA_A_Mineral1: "IntChlorite", P_TSA_A_Weight1: "0.7", P_TSA_A_Mineral2: "FeChlorite", P_TSA_A_Weight2: "0.3", P_TSA_A_Error: "45" }, { P_TSA_A_Mineral1: "Muscovite", P_TSA_A_Weight1: "1", P_TSA_A_Error: "60" }];

test("#2185 the TSA table is not assays: by its column names, and by its cells", () => {
  assert.equal(looksLikeAssay(H, "geology_2_wallaby.csv"), false); // TSA / Weight / Mineral are no grade words, even by header alone
  assert.equal(looksLikeAssay(H, "geology_2_wallaby.csv", rows), false);
  assert.equal(columnHasNumbers(rows, "P_TSA_A_Mineral1"), false);
  assert.equal(columnHasNumbers([{ Au: "<0.01" }, { Au: "1.2" }], "Au"), true);
  assert.equal(columnHasNumbers([{ Au: "" }], "Au"), true); // an empty column says nothing
  // a real assay table is unchanged
  const A = ["HoleID", "SampleID", "From", "To", "Au_ppm", "Cu_ppm"];
  assert.equal(looksLikeAssay(A, "a.csv", [{ Au_ppm: "0.5", Cu_ppm: "<5" }]), true);
});

test("#2185 the Geochem dialog offers no element from a column of words", () => {
  const picked = pickElementColumns(["P_TSA_A_Mineral1", "Au_ppm"], [{ P_TSA_A_Mineral1: "IntChlorite", Au_ppm: "1" }, { P_TSA_A_Mineral1: "Muscovite", Au_ppm: "<0.01" }]);
  assert.deepEqual(picked.map((e) => e.symbol), ["Au"]);
});

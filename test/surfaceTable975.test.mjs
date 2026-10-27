// TASKS.csv #975 — a surface-sample table (coordinates, no from / to) from a database goes to the surface import, not the
// drillhole assay dialog that then refused it
import test from "node:test";
import assert from "node:assert/strict";
import { isSurfaceSampleTable, looksLikeAssay } from "../src/lib/viewer/importHelpers.js";

test("#975 soil / silt tables are surface tables; drillhole assay tables are not", () => {
  const soil = ["sample_id", "easting", "northing", "elevation", "Au_ppb", "Cu_ppm", "Pb_ppm", "Zn_ppm", "As_ppm"];
  assert.equal(looksLikeAssay(soil), true); // it is handed to Geochem as assays...
  assert.equal(isSurfaceSampleTable(soil), true); // ...and Geochem opens it in the surface import
  assert.equal(isSurfaceSampleTable(["SAMP_NUM", "E_UTM", "N_UTM", "SAMP_TYPE", "Au", "Ag", "Cu", "Zn"]), true); // MX-style names
  assert.equal(isSurfaceSampleTable(["hole_id", "from", "to", "Au_ppm", "Cu_ppm", "Pb_ppm", "Zn_ppm"]), false);
  assert.equal(isSurfaceSampleTable(["HOLEID", "SAMPFROM", "SAMPTO", "X", "Y", "Au", "Cu", "Pb", "Zn"]), false); // interval with coordinates
  assert.equal(isSurfaceSampleTable(["sample_id", "Au", "Cu", "Pb", "Zn"]), false); // no coordinates: stays an assay table
});

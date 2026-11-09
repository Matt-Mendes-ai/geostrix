// TASKS.csv #2268 (review #2174) — a two-element soil table dropped on the 3D view goes to Geochem's surface-sample import, not the drillhole dialog
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeSurfaceSamples, looksLikeAssay } from "../src/lib/viewer/importHelpers.js";

const soil = ["sample_id", "east", "north", "Au_ppb", "As_ppm", "medium"];
const rows = [{ sample_id: "S1", east: "1", north: "2", Au_ppb: "5", As_ppm: "12", medium: "soil" }, { sample_id: "S2", east: "3", north: "4", Au_ppb: "<1", As_ppm: "8", medium: "soil" }];

test("the reviewer's soil table: surface samples (looksLikeAssay alone said no)", () => {
  assert.equal(looksLikeAssay(soil, "synth_soils.csv", rows), false);
  assert.equal(looksLikeSurfaceSamples(soil, rows), true);
});

test("not surface samples: collars, outcrop structures, logs, a table with no element", () => {
  assert.equal(looksLikeSurfaceSamples(["hole_id", "easting", "northing", "rl", "Au_ppm"]), false); // a hole ID
  assert.equal(looksLikeSurfaceSamples(["id", "easting", "northing", "elevation", "max_depth", "dip", "azimuth"]), false); // a collar table
  assert.equal(looksLikeSurfaceSamples(["station", "x", "y", "dip", "dip_dir", "type"]), false); // outcrop structures
  assert.equal(looksLikeSurfaceSamples(["station", "x", "y", "strike", "Cu"]), false);
  assert.equal(looksLikeSurfaceSamples(["sample", "x", "y", "from", "to", "Au"]), false); // intervals
  assert.equal(looksLikeSurfaceSamples(["sample", "x", "y", "rock_type", "colour"]), false); // no element column
  assert.equal(looksLikeSurfaceSamples(["sample", "x", "y", "Au_ppb"], [{ sample: "a", x: 1, y: 2, Au_ppb: "" }]), false); // the element column is empty
});

test("a soil table with a sample depth is still samples (the hole-length test is exact)", () => {
  assert.equal(looksLikeSurfaceSamples(["sample_id", "easting", "northing", "sample_depth_cm", "Cu_ppm"]), true);
});

test("both drop paths hand it over, with a surface-sample notice", () => {
  const s = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.equal((s.match(/looksLikeSurfaceSamples\(headers, data\)/g) || []).length, 2);
  assert.match(s, /opened in Geochem's surface-sample import, where you choose the elements\. Not samples\?/);
});

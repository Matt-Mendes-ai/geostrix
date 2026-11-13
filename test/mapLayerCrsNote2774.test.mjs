// TASKS.csv #2774 (split from #2467) — a map layer dropped on the 3D View or imported in Surface Geology says its CRS as Boundaries / Claims do (#2467):
// by name with the code, what was done, and the datum caveat when a shift was applied; a layer already in the project CRS says so (it said a bare
// 'EPSG:26910'). Synthetic points only.
import test from "node:test";
import assert from "node:assert/strict";
import { buildLayer } from "../src/lib/mapLayerBuild.js";

const parsed = (epsg) => ({ epsg, geomType: "point", features: [{ parts: [[[500000, 5800000]]], attributes: {} }] });

test("another CRS: both by name, the datum caveat after a semicolon", () => {
  const n = buildLayer(parsed(26710), { sourceName: "n27", projectEpsg: 26910 }).crsNote;
  assert.match(n, /^its NAD27 \/ UTM zone 10N[^(]* \(EPSG:26710\) was reprojected to the project's NAD83 \/ UTM zone 10N \(EPSG:26910\); NAD27: /);
  assert.doesNotMatch(n, /⚠|^reprojected EPSG:/, "the old shape is gone");
});

test("the project CRS itself, and a file with no CRS, are said by name", () => {
  assert.equal(buildLayer(parsed(26910), { sourceName: "same", projectEpsg: 26910 }).crsNote, "in NAD83 / UTM zone 10N (EPSG:26910), the project's coordinate system");
  assert.equal(buildLayer(parsed(null), { sourceName: "none", projectEpsg: 26910 }).crsNote, "no CRS in file — assumed the project's NAD83 / UTM zone 10N (EPSG:26910)");
  assert.equal(buildLayer(parsed(26910), { sourceName: "nodst", projectEpsg: null }).crsNote, "in NAD83 / UTM zone 10N (EPSG:26910)");
});

// TASKS.csv #1701 (review #1645, Copley) — 'Export all drillhole tables' writes the custom layers and the assays too
import test from "node:test";
import assert from "node:assert/strict";
import { drillholeTableFiles, assayTableRows, customLayerFileName } from "../src/lib/drillholeTables.js";

const assays = [{ hole_id: "H1", from: 0, to: 2, values: { Cu: 1200, Au: 0.004, Zn: 0.5 }, qualifiers: { Au: "<" }, sample_id: "S1", source: "lab" }];
const els = [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "ppm" }, { symbol: "Zn", unit: "%" }];

test("#1701 assays as one wide table: units in the headers, qualifiers kept, the row's own fields after", () => {
  assert.deepEqual(assayTableRows(assays, els), [{ hole_id: "H1", from: 0, to: 2, Cu_ppm: 1200, Au_ppm: "<0.004", Zn_pct: 0.5, sample_id: "S1", source: "lab" }]);
});

test("#1701 the zip's files: one per custom layer (safe, unique names) and assays.csv", () => {
  const custom = [{ name: "Copley 2023 DH SWIR/Halo", rows: [{ hole_id: "H1", depth: 5, value: "ILL", Halo_AlOH: 2205 }] }, { name: "Copley 2023 DH SWIR/Halo", rows: [{ hole_id: "H1", from: 0, to: 1, value: "x" }] }, { name: "empty", rows: [] }];
  const files = drillholeTableFiles({ collars: [{ hole_id: "H1", x: 1, y: 2, z: 3, azimuth: 90, dip: 60, length: 10 }], customLayers: custom, assays, assayElements: els, epsg: 26910, version: "t" });
  assert.deepEqual(files.map((f) => f.name), ["collars.csv", "custom_copley_2023_dh_swir_halo.csv", "custom_copley_2023_dh_swir_halo_2.csv", "assays.csv"]);
  const swir = files[1].text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(swir, ["hole_id,depth,value,Halo_AlOH", "H1,5,ILL,2205"]);
  assert.equal(customLayerFileName("", 3), "custom_layer_4.csv");
  assert.equal(drillholeTableFiles({ assays, assayElements: [] }).length, 0, "no element list: no assay table");
});

// TASKS.csv #3187 (side 1's pick B, tiedExport.bearingAttributeNote) — the shapefile and GeoPackage exports of a tied local grid say which columns
// look like bearings and were written as they are (the positions are turned through the tie, the attribute columns are not).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bearingAttributeNote } from "../src/lib/tiedExport.js";

test("the exports' success notices carry the bearing sentence on a tied grid", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /appendNotice\(notice\("Exported \{features\} feature\(s\) from \\"\{label\}\\" as a shapefile [^\n]*\), tx\.bearingAttributeNote\(features, ex\?\.tie\) \/\* #3187 \*\/\)/);
  assert.match(s, /appendNotice\(notice\("Exported \{features\} feature\(s\) from \\"\{label\}\\" as a GeoPackage \(\.gpkg\)\.", \{ features: features\.length, label \}\), tx\.bearingAttributeNote\(features, ex\?\.tie\) \/\* #3187 \*\/\)/);
});

test("the exported features' columns are what the sentence reads (attributes)", () => {
  const tie = { epsg: 28350, a: 1, b: 0.1, tx: 0, ty: 0 };
  assert.match(bearingAttributeNote([{ geometry: [[0, 0, 0]], attributes: { hole_id: "H1", dip_dir: 140 } }], tie), /dip_dir/);
  assert.equal(bearingAttributeNote([{ geometry: [[0, 0, 0]], attributes: { hole_id: "H1", dip: 60 } }], tie), "");
});

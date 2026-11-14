// TASKS.csv #3476 / #3477 / #3478 / #3479 — follow-ups of the Maps lows
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeSameBoxOptions } from "../src/lib/dataExtent.js";
import { defaultSpectralIndex } from "../src/lib/indexForProject.js";
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3476 A file: Easting / Northing columns that land within 50 km of the collars pre-set From to the project CRS", () => {
  const c = read("modules/CartographyModule.jsx");
  assert.match(c, /if \(off && off\.km <= 50\) \{ implied = project\.epsg; landed = true; \}/);
  assert.match(c, /the points land beside the project's collars when read in it\./);
});
test("#3477 several rasters of one box are one line, with how many more share it", () => {
  const b = [-131.3, 57.1, -131.2, 57.2];
  const o = mergeSameBoxOptions([{ id: "a", label: "Raster: A", bboxLonLat: b }, { id: "b", label: "Raster: B", bboxLonLat: [...b] }, { id: "c", label: "Raster: C", bboxLonLat: [-131.3, 57.1, -131.2, 57.20004] }, { id: "d", label: "Boundary: D", bboxLonLat: [1, 2, 3, 4] }], (n) => `+${n} same box`);
  assert.deepEqual(o.map((x) => [x.id, x.label]), [["a", "Raster: A (+2 same box)"], ["d", "Boundary: D"]]); // 5e-5 degree rounds to the same box
  assert.deepEqual(mergeSameBoxOptions(null), []);
});
test("#3478 a boundary keeps its source attributes up to 300 features and shows them on its card", () => {
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /\(attributes \|\| \[\]\)\.length > 300/);
  assert.match(g, /\.\.\.\(attributes \? \{ featureOf, attributes \} : \{\}\) \/\* #3478 \*\//);
  assert.match(g, /tr\("\{n\} feature\(s\); attributes: \{cols\}"/);
});
test("#3479 an iron project (half the holes with Fe of 30 % or more) opens on ferric iron; anything else on clay", () => {
  const el = [{ symbol: "Fe", unit: "%" }];
  const mk = (vals) => vals.map((v, i) => ({ hole_id: `H${i}`, from: 0, to: 1, values: { Fe: v } }));
  assert.equal(defaultSpectralIndex(mk([55, 60, 32, 20, 58]), el), "s2_ferric");
  assert.equal(defaultSpectralIndex(mk([5, 8, 12, 3]), el), "s2_clay");
  assert.equal(defaultSpectralIndex(mk([55, 60]), el), "s2_clay"); // under 3 holes: no word
  assert.equal(defaultSpectralIndex(mk([55, 60, 62]), [{ symbol: "Cu", unit: "%" }]), "s2_clay"); // no iron element
  assert.equal(defaultSpectralIndex(mk([550000, 600000, 320000]), [{ symbol: "Fe", unit: "ppm" }]), "s2_ferric");
  assert.match(read("modules/RasterModule.jsx"), /defaultPreset=\{defaultSpectralIndex\(assays, assayElements\)\}/);
});

// TASKS.csv #1719 — subcrop points from the collars: the first logged unit under cover, at the hole's position at that depth.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarSubcrop, subcropLayer } from "../src/lib/collarSubcrop.js";
import { featureCategoryValue } from "../src/lib/mapLayers.js";

const collars = [
  { hole_id: "V1", x: 1000, y: 2000, z: 500, total_depth: 100 },
  { hole_id: "A1", x: 1100, y: 2000, z: 500, total_depth: 100 },
  { hole_id: "C1", x: 1200, y: 2000, z: 500, total_depth: 30 },
  { hole_id: "N1", x: 1300, y: 2000, z: 500, total_depth: 30 },
];
const survey = [
  { hole_id: "V1", depth: 0, azimuth: 0, dip: 90 }, { hole_id: "V1", depth: 100, azimuth: 0, dip: 90 },
  { hole_id: "A1", depth: 0, azimuth: 90, dip: 45 }, { hole_id: "A1", depth: 100, azimuth: 90, dip: 45 },
];
const litho = [
  { hole_id: "V1", from: 0, to: 6, value: "OB" }, { hole_id: "V1", from: 6, to: 40, value: "SLST" }, { hole_id: "V1", from: 40, to: 100, value: "LMST" },
  { hole_id: "A1", from: 10, to: 20, value: "LMST" }, { hole_id: "A1", from: 0, to: 4, value: "CAS" }, { hole_id: "A1", from: 4, to: 10, value: "NRCV" },
  { hole_id: "C1", from: 0, to: 30, value: "Overburden" },
];

test("the first unit under overburden, casing and no recovery, at the hole's own position at that depth", () => {
  const pts = collarSubcrop({ collars, survey, litho, desurveyMethod: "minimum_curvature" });
  assert.deepEqual(pts.map((p) => [p.hole_id, p.unit, p.from]), [["V1", "SLST", 6], ["A1", "LMST", 10]]);
  const v = pts[0], a = pts[1];
  assert.ok(Math.abs(v.x - 1000) < 1e-6 && Math.abs(v.z - 494) < 1e-6, "vertical: under the collar, 6 m down");
  const d = 10 / Math.SQRT2; // 10 m down a 45° hole (dip positive down, as stored) to the east
  assert.ok(Math.abs(a.x - (1100 + d)) < 0.01 && Math.abs(a.y - 2000) < 0.01 && Math.abs(a.z - (500 - d)) < 0.01, JSON.stringify(a));
  assert.equal(a.cover, 10);
});

test("a hole all in cover, or not logged, gives no point", () => {
  const pts = collarSubcrop({ collars, survey, litho, desurveyMethod: "minimum_curvature" });
  assert.ok(!pts.some((p) => p.hole_id === "C1" || p.hole_id === "N1"));
});

test("as a point map layer coloured by unit", () => {
  const L = subcropLayer(collarSubcrop({ collars, survey, litho }), "Subcrop from collars");
  assert.equal(L.geomType, "point");
  assert.equal(L.styleField, "unit");
  assert.equal(L.features.length, 2);
  assert.deepEqual(L.categories.map((c) => c.value).sort(), ["LMST", "SLST"]);
  assert.equal(featureCategoryValue(L.features[1], "unit"), "LMST");
  assert.deepEqual(L.features[0].attributes, { unit: "SLST", hole_id: "V1", from_m: 6, cover_m: 6 });
  assert.equal(L.features[0].parts[0][0].length, 3);
});

test("wired on Surface Geology > Map layers", () => {
  const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /collarSubcrop\(\{ collars, survey, litho: layers\.litho, desurveyMethod(, roleOf: roleWithCodes\(modellingCodes\))?(, report: rep)?(, atDepthM: depth)? \}\)/); // atDepthM: #2956 // report: #2411
  assert.match(s, /addMapLayer\(\{ \.\.\.layer, drapeMode: terrain \? "terrain" : "file" \}\)/);
});

test("colours come from the view's own rule (a legend override wins)", () => {
  const L = subcropLayer([{ hole_id: "H", unit: "SLST", from: 3, cover: 3, x: 0, y: 0, z: 0 }], "S", (u) => (u === "SLST" ? "#123456" : "#000000"));
  assert.equal(L.categories[0].color, "#123456");
  const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /categoryColor\(viewerUiState\?\.legendOverride\?\.litho\?\.\[u\], LAYER_META\.litho, u\)/);
});

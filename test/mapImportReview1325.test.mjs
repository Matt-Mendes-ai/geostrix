import test from "node:test";
import assert from "node:assert/strict";
import { classifyTables, needsImportReview, featuresBox, isCoveringPolygon } from "../src/lib/mapImportReview.js";

const box = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
const table = (name, epsg, b, extra = {}) => ({ name, epsg, layers: [{ geomType: extra.geom || "polygon", fields: extra.fields || [], features: extra.features || [{ parts: box(...b), attributes: {} }] }] });
const toCommon = (b, epsg) => (epsg === 4267 ? [-1500000, 4000000, 3000000, 9000000] : b);
const classes = (tables, opts = {}) => Object.fromEntries(classifyTables(tables, { toCommon, ...opts }).map((r) => [r.table.name, r.cls]));
const near = [663000, 6289000, 667000, 6293000];

test("#1325 sorted by where each table sits, as in file 27622Z", () => {
  const c = classes([
    table("Geology", 26909, near), table("Claims", 26909, [659890, 6288359, 666778, 6294239]), table("Contours", 26909, [658769, 6287014, 671433, 6298619]),
    table("CANADA", 4267, [-141, 42, -53, 83]),
    table("LocMapLats", 26909, [-1390186, 4983437, 2547117, 8486493]),
    table("CAN_RIVERS", null, [-2752923, -937258, 2370927, 3366840]),
    table("8M-scale", null, [1, 0, 9, 1]),
    table("R0413_section", null, [118, 1476, 187, 1663]),
    table("5K_Geology_Legend", 26909, near),
    table("base_5k_UTM_grid", 26909, near),
    table("topolabels", 26909, near, { geom: "point", features: [{ parts: [[663500, 6290000]], attributes: { _text: "Red Creek" } }] }),
  ]);
  assert.deepEqual(c, { Geology: "map", Claims: "map", Contours: "map", CANADA: "regional", LocMapLats: "regional", CAN_RIVERS: "page", "8M-scale": "page", R0413_section: "page", "5K_Geology_Legend": "page", base_5k_UTM_grid: "grid", topolabels: "labels" });
});
test("#1325 a tidy import is not interrupted", () => {
  assert.equal(needsImportReview(classifyTables([table("A", 26909, near), table("B", 26909, [664000, 6290000, 668000, 6294000])], { toCommon })), false);
  assert.equal(needsImportReview(classifyTables([table("Only", null, [1, 2, 3, 4])], { toCommon })), false, "one file with no CRS and nothing to compare with");
});
test("#1325 with a project already loaded, a table with no CRS counts if it sits on the data", () => {
  const refBox = near;
  const c = classes([table("local", null, [663500, 6290000, 664000, 6290500]), table("page", null, [1, 2, 3, 4]), table("far", 26909, [100000, 5000000, 104000, 5004000])], { refBox });
  assert.deepEqual(c, { local: "map", page: "page", far: "regional" });
});
test("#1325 a region-sized project of its own stays a map", () => {
  const big = [400000, 5500000, 900000, 6500000];
  const c = classes([table("Region A", 26909, big), table("Region B", 26909, [410000, 5510000, 890000, 6490000])]);
  assert.deepEqual(c, { "Region A": "map", "Region B": "map" });
});
test("#1325 tenure and masks are outlines; a geology polygon is not; a label table with one stray point is still labels", () => {
  for (const n of ["Claims", "Fleet_Claims", "5K_Geology_polygons_mask", "Mineral Tenure", "lease 3"]) assert.ok(isCoveringPolygon(n, "polygon"), n);
  assert.equal(isCoveringPolygon("5K_Geology_polygons", "polygon"), false);
  assert.equal(isCoveringPolygon("Claims", "polyline"), false);
  const pts = Array.from({ length: 20 }, () => ({ parts: [[663500, 6290000]], attributes: { _text: "x" } }));
  const t = { name: "Text", epsg: 26909, layers: [{ geomType: "point", fields: [], features: [{ parts: [[663500, 6290000]], attributes: {} }, ...pts] }] };
  assert.equal(classifyTables([table("Geology", 26909, near), t], { toCommon }).find((r) => r.table.name === "Text").cls, "labels");
});
test("#1325 the box walks every geometry shape", () => {
  assert.deepEqual(featuresBox([{ parts: [[1, 2]] }, { parts: [[[5, -1], [3, 9]]] }, { parts: box(0, 0, 2, 2) }]), [0, -1, 5, 9]);
  assert.equal(featuresBox([]), null);
});

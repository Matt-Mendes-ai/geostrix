// TASKS.csv #1504 — a collar file's other columns travel with the holes; a project without a survey says the holes are straight
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfaceAttrColumns, surfaceAttrs } from "../src/lib/geochem.js";
import { attributeFields } from "../src/lib/viewer/identify.js";

const rows = Array.from({ length: 120 }, (_, i) => ({ hole_id: `H${i}`, x: String(600000 + i), y: "6350000", z: "1500", azimuth: "70", dip: "-50", depth: "200", year: i < 60 ? "2021" : "2022", drill_type: i % 4 ? "DD" : "RC", zone: ["CC", "AGB", "DR-PX"][i % 3], comments: `core lost ${i} m, see daily report` }));
const mapping = { hole_id: "hole_id", x: "x", y: "y", z: "z", azimuth: "azimuth", dip: "dip", length: "depth" };

test("unmapped columns are kept: categories and free-text comments; the mapped ones are not repeated", () => {
  const cols = surfaceAttrColumns(Object.keys(rows[0]), rows, mapping);
  assert.deepEqual(cols, ["year", "drill_type", "zone", "comments"]);
  assert.deepEqual(surfaceAttrs(rows[5], cols).attrs, { year: "2021", drill_type: "DD", zone: "DR-PX", comments: "core lost 5 m, see daily report" });
});

test("Identify lists a collar's fields and its kept columns", () => {
  const c = { hole_id: "H5", x: 600005, y: 6350000, z: 1500, azimuth: 70, dip: 50, length: 200, attrs: { year: "2021", drill_type: "DD" } };
  const f = [...attributeFields(c), ...attributeFields(c.attrs, new Set())];
  assert.ok(f.some(([k]) => k === "x") && f.some(([k, v]) => k === "year" && v === "2021") && !f.some(([k]) => k === "hole_id"));
});

test("wired: the import keeps them and says so; the marker carries its collar; Identify reads it", () => {
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /\.\.\.surfaceAttrs\(r, attrCols\), \/\/ #1504/);
  assert.match(p, /more column\(s\) kept with each hole/);
  assert.match(p, /no survey loaded, so each hole is drawn straight/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /, collar: c \}; \/\/ collar: #1504/, "the collar marker carries its collar record"); // the tip gained a #2014 suffix
  const i = readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8");
  assert.match(i, /attributeFields\(c\.attrs, new Set\(\)\)/);
});

// TASKS.csv #2679 — a surface import whose coordinates are longitude / latitude columns takes their datum from the column names
// (GDA94 / GDA2020, #2166) instead of a fixed WGS 84
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lonLatColumns } from "../src/lib/projectCrs.js";

test("the datum from the column names", () => {
  const rows = [{ LONG_GDA94: "123.79", LAT_GDA94: "-29.98" }];
  const r = lonLatColumns(Object.keys(rows[0]), rows);
  assert.ok(r);
  assert.equal(r.epsg, 4283); // GDA94, from the header names (#2166)
  const g20 = [{ LONG_GDA2020: "123.79", LAT_GDA2020: "-29.98" }];
  assert.equal(lonLatColumns(Object.keys(g20[0]), g20).epsg, 7844);
});

test("the surface import uses it", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /sourceEpsg = String\(ll\.epsg \|\| 4326\)/);
  assert.doesNotMatch(g, /if \(!sourceEpsg\) \{ sourceEpsg = "4326"; sourceEpsgFrom = `\$\{ll\.x\} \/ \$\{ll\.y\}`; \}/);
});

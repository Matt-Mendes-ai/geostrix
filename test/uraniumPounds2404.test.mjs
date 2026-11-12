// TASKS.csv #2404 — a uranium grade-tonnage gives millions of pounds of U3O8 beside the U and U3O8 tonnes (the unit uranium is quoted
// in); the grade column already carries its unit (#2218)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metalColumns, metalOf, gradeTonnageRows } from "../src/lib/gradeTonnage.js";

test("#2404 U3O8 in millions of pounds, from the U3O8 tonnes", () => {
  const cols = metalColumns(metalOf("ppm"), "U");
  const t = cols.find((c) => c.key === "metal_t_U3O8"), lb = cols.find((c) => c.key === "metal_mlb_U3O8");
  assert.deepEqual([lb.label, lb.args.el], ["{el} (Mlb)", "U3O8"]);
  assert.ok(Math.abs(lb.factor / t.factor - 2204.62262 / 1e6) < 1e-15);
  // the review's row: 135,956,250 t at 161 ppm U -> 21,953.5 t U -> 25,887.6 t U3O8 -> 57.07 Mlb U3O8
  const metal = 21953.5e6; // grams of U: the review's 21,953.5 t (135,956,250 t x 161.47 ppm)
  const [row] = gradeTonnageRows([{ cutoff: 100, blocks: 4834, volumeM3: 75531250, meanGrade: 161.47, tonnes: 135956250, metal }], { vname: "U", density: 1.8, metal: metalOf("ppm"), columns: cols });
  assert.ok(Math.abs(row.metal_t - 21953.5) < 0.5, String(row.metal_t));
  assert.ok(Math.abs(row.metal_mlb_U3O8 - 57.07) < 0.01, String(row.metal_mlb_U3O8));
  // nothing in pounds for other elements
  for (const [u, el] of [["ppm", "Cu"], ["%", "Li"], ["g/t", "Au"], ["%", "Ta"]]) assert.ok(!metalColumns(metalOf(u), el).some((c) => c.key.startsWith("metal_mlb")), el);
});

test("#2404 the table's grade header names its unit", () => {
  const m = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(m, /unitL \? tr\("Mean grade \(\{unit\}\)", \{ unit: unitL \}\) : tr\("Mean grade"\)/);
  assert.equal((m.match(/c\.key\.startsWith\("metal_mlb"\) \? sig\(r\.metal \* c\.factor\)/g) || []).length, 2); // both tables
});

// TASKS.csv #3284 (Galore Creek review) — conceptual tonnages from 14 holes were printed to the tonne, the tenth of a tonne and the ounce
// ('Tonnes 2,894,940,928', 'Cu (t) 9,931,925.8', 'Metal (troy oz) 7,103,093') under a caution that asks for ranges. Grade-tonnage now shows
// tonnes and metal to three significant figures, the exact sum on hover, and the CSV keeps them whole. (The shell card's figures are in
// ViewerModule.jsx, another session's file: not changed here.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeTonnageTable, gradeTonnageRows } from "../src/lib/gradeTonnage.js";

const m = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the table: tonnes and every metal column (both tables, the set's members) to three significant figures, exact on hover", () => {
  assert.equal((m.match(/\{tonnesOn && <td style=\{td\} title=\{exactTitle\(r\.tonnes\)\}>\{sig\(r\.tonnes\)\}<\/td>\}/g) || []).length, 2);
  assert.equal((m.match(/title=\{r\.metal == null \? undefined : exactTitle\(r\.metal \* c\.factor\)\}>\{r\.metal == null \? "—" : sig\(r\.metal \* c\.factor\)/g) || []).length, 2);
  assert.match(m, /title=\{exactTitle\(vals\[j\]\?\.value\)\}>\{vals\[j\]\?\.value == null \? "—" : sig\(vals\[j\]\.value\)/);
  assert.ok(!/<td style=\{td\}>\{fmt\(r\.tonnes\)\}<\/td>/.test(m));
  assert.match(m, /tonnesOn && <>\{tr\("Tonnes and metal are shown to three significant figures/);
  // the formatter: three significant figures with separators
  const sig = (v) => Number(v.toPrecision(3)).toLocaleString("en-CA");
  assert.equal(sig(2894940928), "2,890,000,000");
  assert.equal(sig(9931925.8), "9,930,000");
  assert.equal(sig(7103093), "7,100,000");
});

test("the CSV keeps the whole figures", () => {
  const cells = [{ x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, value: 3430 }];
  const rows = gradeTonnageTable(cells, { cutoffs: [0], density: 2.684, unit: "ppm" });
  const out = gradeTonnageRows(rows, { vname: "Cu_ppm", density: 2.684, metal: { unit: "g" } });
  assert.equal(out[0].tonnes, 2684);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Exact: {v}. Shown to three significant figures: a conceptual figure; the CSV keeps it whole.", "Tonnes and metal are shown to three significant figures (hover a figure for the exact sum; the CSV keeps it whole): they are conceptual."]) assert.ok(d[k], `${l}: ${k}`);
  }
});

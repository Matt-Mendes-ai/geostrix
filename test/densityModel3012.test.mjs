// TASKS.csv #3012 (WA iron review) — Grade-tonnage takes the density estimated onto the same blocks
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameLattice, densityFromModel, DENSITY_RANGE } from "../src/lib/densityFromModel.js";
import { blockModelLattice } from "../src/lib/estimationMeta.js";
import { gradeTonnageTable } from "../src/lib/gradeTonnage.js";

const cell = (x, y, z, value) => ({ x, y, z, dx: 10, dy: 10, dz: 5, value });
const grade = { cells: [cell(5, 5, 2.5, 60), cell(15, 5, 2.5, 50), cell(25, 5, 2.5, 40), cell(35, 5, 2.5, 58)] };
const dens = { cells: [cell(5, 5, 2.5, 3.2), cell(15, 5, 2.5, 2.8), cell(25, 5, 2.5, 9.9) /* not a density */, cell(105, 5, 2.5, 3.0)] };

test("the same lattice, or not", () => {
  assert.ok(sameLattice(blockModelLattice(grade), blockModelLattice(dens)));
  assert.ok(!sameLattice(blockModelLattice(grade), blockModelLattice({ cells: [cell(5, 5, 2.5, 1), cell(17, 5, 2.5, 1)] })), "offset by 2 m");
  assert.ok(!sameLattice(blockModelLattice(grade), blockModelLattice({ cells: [{ ...cell(5, 5, 2.5, 1), dz: 2 }] })), "another cell height");
});

test("each block its own density; out of range or missing: the typed default; the tonnage by hand", () => {
  const d = densityFromModel(dens.cells, blockModelLattice(grade), 2.7);
  assert.deepEqual(grade.cells.map((c) => d.of(c)), [3.2, 2.8, 2.7, 2.7]);
  assert.deepEqual(d.stats(), { taken: 3, outOfRange: 1 }); assert.deepEqual(DENSITY_RANGE, [1, 6]);
  const rows = gradeTonnageTable(grade.cells, { cutoffs: [55], density: 2.7, unit: "%", densityOf: d.of });
  // at 55 %: the 60 % block (3.2) and the 58 % block (2.7), each 500 m3 -> 1,600 + 1,350 = 2,950 t
  assert.ok(Math.abs(rows[0].tonnes - 2950) < 1e-6, String(rows[0].tonnes));
  assert.equal(densityFromModel(dens.cells, blockModelLattice(grade), null).of(grade.cells[3]), null, "no default: no density");
});

test("the modal offers the models on the same blocks and says what was used", () => {
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /densityModels\.map\(\(m\) => <option key=\{m\.id\} value=\{`model:\$\{m\.id\}`\}>/);
  assert.match(g, /densityOf: byModel\?\.of \|\| byCode\?\.of \|\| null/);
  assert.match(g, /tr\("Density from the block model \\"\{name\}\\" on the same blocks:/);
});

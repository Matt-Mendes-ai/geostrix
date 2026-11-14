// TASKS.csv #3270 (Galore Creek review) — grade-tonnage with density from a block model mixed two sets of blocks in one row: Blocks and Volume
// counted all 39,423 blocks while tonnes, metal and the mean grade were those of the 36,896 with a density (2.53 t/m3 read off a rock of 2.71),
// and the grade was tonnage-weighted under a note that said volume-weighted. One population per row now, and the rest counted apart.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeTonnageTable, gradeTonnageByBench, gradeTonnageRows } from "../src/lib/gradeTonnage.js";
import { memberMeans } from "../src/lib/setLimits.js";

const cell = (x, value) => ({ x, y: 0, z: 5, dx: 10, dy: 10, dz: 10, value });
const cells = [cell(0, 1), cell(10, 2), cell(20, 3), cell(30, 4)];
const rho = new Map([[cells[0], 2.6], [cells[1], 2.8], [cells[2], 2.7]]); // the fourth block has no density
const densityOf = (c) => rho.get(c) ?? null;

test("a row counts only the blocks that have a density; the rest are counted apart", () => {
  const [r0, r3] = gradeTonnageTable(cells, { cutoffs: [0, 3], unit: "%", densityOf });
  assert.equal(r0.blocks, 3); assert.equal(r0.volumeM3, 3000);
  assert.equal(r0.noDensityBlocks, 1); assert.equal(r0.noDensityVolumeM3, 1000);
  assert.ok(Math.abs(r0.tonnes - 1000 * (2.6 + 2.8 + 2.7)) < 1e-9);
  assert.ok(Math.abs(r0.tonnes / r0.volumeM3 - (2.6 + 2.8 + 2.7) / 3) < 1e-12, "tonnes / volume is the density of the counted blocks");
  assert.ok(Math.abs(r0.meanGrade - (1 * 2.6 + 2 * 2.8 + 3 * 2.7) / (2.6 + 2.8 + 2.7)) < 1e-12, "tonnage-weighted over the same blocks");
  assert.ok(Math.abs(r0.metal - (1 * 2.6 + 2 * 2.8 + 3 * 2.7) * 1000 * 0.01) < 1e-9);
  assert.equal(r3.blocks, 1); assert.equal(r3.noDensityBlocks, 1);
  // every block with a density: nothing left out, as before
  const all = gradeTonnageTable(cells.slice(0, 3), { cutoffs: [0], unit: "%", densityOf })[0];
  assert.equal(all.blocks, 3); assert.equal(all.noDensityBlocks, 0);
  // no block with a density at that cutoff: every block, volume-weighted, no tonnes
  const none = gradeTonnageTable(cells, { cutoffs: [4], unit: "%", densityOf })[0];
  assert.equal(none.blocks, 1); assert.equal(none.tonnes, null); assert.equal(none.meanGrade, 4); assert.equal(none.noDensityBlocks, 0);
  // one typed density (no densityOf): unchanged, no left-out fields
  const one = gradeTonnageTable(cells, { cutoffs: [0], density: 2.7, unit: "%" })[0];
  assert.equal(one.blocks, 4); assert.equal(one.noDensityBlocks, undefined);
});

test("the shares are over the counted blocks", () => {
  const cs = cells.map((c, i) => ({ ...c, support: i === 3 ? "interpolated" : i === 0 ? "interpolated" : "extrapolated" }));
  const d = new Map([[cs[0], 2.6], [cs[1], 2.8], [cs[2], 2.7]]);
  const r = gradeTonnageTable(cs, { cutoffs: [0], unit: "%", densityOf: (c) => d.get(c) ?? null })[0];
  assert.ok(Math.abs(r.interpolatedShare - 1 / 3) < 1e-12); // cs[3] (interpolated, no density) is not in the row
});

test("the bench table: the same population", () => {
  const b = gradeTonnageByBench(cells, { cutoff: 0, benchH: 10, unit: "%", densityOf })[0];
  assert.equal(b.blocks, 3); assert.equal(b.volumeM3, 3000); assert.equal(b.noDensityBlocks, 1); assert.equal(b.noDensityVolumeM3, 1000);
  assert.ok(Math.abs(b.tonnes - 1000 * 8.1) < 1e-9);
  const none = gradeTonnageByBench([cell(30, 4)], { cutoff: 0, benchH: 10, unit: "%", densityOf })[0];
  assert.equal(none.blocks, 1); assert.equal(none.tonnes, null); assert.equal(none.noDensityBlocks, 0);
});

test("the CSV: blocks_no_density / volume_no_density_m3 only when a row left blocks out", () => {
  const rows = gradeTonnageTable(cells, { cutoffs: [0, 3], unit: "%", densityOf });
  const out = gradeTonnageRows(rows, { vname: "Cu_pct", density: "from the density model", metal: { unit: "t" } });
  assert.equal(out[0].blocks_no_density, 1); assert.equal(out[0].volume_no_density_m3, 1000); assert.equal(out[0].blocks, 3);
  const full = gradeTonnageRows(gradeTonnageTable(cells.slice(0, 3), { cutoffs: [0], unit: "%", densityOf }), { vname: "Cu_pct", density: "from the density model", metal: { unit: "t" } });
  assert.ok(!("blocks_no_density" in full[0]));
});

test("the set's other elements: covered is a share of the counted volume", () => {
  const join = { members: [0], valueAt: (c) => (c === cells[2] ? undefined : 10) }; // the member has no value in cells[2]
  const m = memberMeans(cells, join, { cutoffs: [0], densityOf })[0].means[0];
  assert.ok(Math.abs(m.covered - 2 / 3) < 1e-12); // of the 3 blocks with a density, not of all 4
  const v = memberMeans(cells, join, { cutoffs: [0] })[0].means[0];
  assert.ok(Math.abs(v.covered - 3 / 4) < 1e-12);
});

test("wiring: the No density column, the footnote, the density model's line, the CSV header; keys", () => {
  const m = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const perBlock = !!\(byModel\?\.of \|\| byCode\?\.of\), noDensCol = perBlock && rows\.some\(\(r\) => r\.noDensityBlocks > 0\)/);
  assert.match(m, /\{noDensCol && <th style=\{th\}[^>]*>\{tr\("No density"\)\}<\/th>\}/);
  assert.match(m, /\{noDensCol && <td style=\{td\}>\{fmt\(r\.noDensityBlocks \|\| 0\)\}<\/td>\}/);
  assert.match(m, /\{noDensBench && <td style=\{td\}>\{fmt\(r\.noDensityBlocks \|\| 0, 1\)\}<\/td>\}/);
  assert.match(m, /perBlock && rows\.some\(\(r\) => r\.tonnes != null\) \? tr\("Mean grade is tonnage-weighted/);
  assert.match(m, /tr\("no density and are counted apart, in the No density column"\)/);
  assert.match(m, /`Mean grade: tonnage-weighted \(block volume x its density\) over the blocks with a density at or above the cutoff/);
  assert.ok(!/tr\("no density, so no tonnes"\)/.test(m));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["No density", "Blocks at this cutoff with no density: left out of the row (its blocks, volume, grade and tonnes)", "no density and are counted apart, in the No density column",
      "Mean grade is tonnage-weighted (each block's volume times its density) over the blocks with a density at or above each cutoff; blocks with none are left out of the row.",
      "Enter a Density to give the blocks with none a value: no default is assumed."]) assert.ok(d[k], `${l}: ${k}`);
  }
});

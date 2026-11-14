// TASKS.csv #3311 (review Galore Creek) — a Cu-Au-Ag porphyry: the pit shell priced copper and ONE by-product, so silver was left out of the
// revenue and the ore decision. A 'report too' grade with a price is priced as a by-product. #3312 — a typed cut-off decides the ore in the
// pit design as in the shell, even with a by-product (cellIsOre).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pitEconomics, cellRevenue, cellIsOre, cellMargin, runPitShell } from "../src/lib/pitShell.js";

const G_PER_OZ = 31.1034768;
// 3 x 3 x 2 blocks of 10 m: Cu 1000 ppm (below its cut-off alone), Au 0.1 g/t, Ag 20 g/t
const cells = [];
for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 1000 });
const at = (v) => cells.map((c) => ({ x: c.x, y: c.y, z: c.z, value: v }));
const base = { unit: "ppm", element: "Cu", price: 4, priceUnit: "lb", recovery: 88, miningCost: 2.5, processingCost: 10, density: 2.7, slopeDeg: 45, revenueFactor: 1, size: null };
const by = { unit: "g/t", element: "Au", price: 1900, priceUnit: "oz", recovery: 70 };
const ag = { unit: "g/t", element: "Ag", price: 24, priceUnit: "oz", recovery: 65 };

test("#3311 a priced other grade earns revenue in every block, as a by-product does", () => {
  const e = pitEconomics({ ...base, by, alsoPrices: [ag] });
  assert.ok(Math.abs(e.alsoPriced[0].revenuePerGrade - 0.65 * (24 / G_PER_OZ)) < 1e-9);
  const c = { value: 1000, by: 0.1, also: [20] };
  const want = 1000 * e.revenuePerGrade + 0.1 * e.by.revenuePerGrade + 20 * e.alsoPriced[0].revenuePerGrade;
  assert.ok(Math.abs(cellRevenue(c, e) - want) < 1e-9);
  assert.ok(Math.abs(cellRevenue({ ...c, also: [NaN] }, e) - (want - 20 * e.alsoPriced[0].revenuePerGrade)) < 1e-9, "a block with no Ag earns none");
  assert.equal(pitEconomics({ ...base, alsoPrices: [null] }).alsoPriced, undefined, "nothing priced: as before");
  assert.equal(pitEconomics({ ...base, alsoPrices: [{ ...ag, unit: "index" }] }).alsoFailed, 1);
});

test("#3311 the pit: Cu + Au alone does not pay; with Ag priced it does, and Ag has its metal and share", () => {
  const plain = runPitShell({ ...base, cells, by, byCells: at(0.1), alsoCells: [{ label: "Ag", unit: "g/t", element: "Ag", cells: at(20) }] });
  assert.ok(plain.empty || !(plain.oreT > 0), "Ag reported only: no ore");
  const r = runPitShell({ ...base, cells, by, byCells: at(0.1), alsoCells: [{ label: "Ag", unit: "g/t", element: "Ag", cells: at(20) }], alsoPrices: [ag] });
  assert.ok(r.oreT > 0, "Ag priced: the blocks pay");
  const a = r.alsoGrades[0];
  assert.ok(a.priced && Math.abs(a.priced.metalU - r.oreT * 20) / (r.oreT * 20) < 1e-6, "Ag in the ore: tonnes x grade (g)");
  const e = pitEconomics({ ...base, by, alsoPrices: [ag] });
  const r1 = r.oreT * 1000 * e.revenuePerGrade, r2 = r.oreT * 0.1 * e.by.revenuePerGrade, r3 = r.oreT * 20 * e.alsoPriced[0].revenuePerGrade;
  assert.ok(Math.abs(a.priced.revenueShare - r3 / (r1 + r2 + r3)) < 1e-6);
  assert.ok(Math.abs(r.by.revenueShare - r2 / (r1 + r2 + r3)) < 1e-6, "the by-product's share is of every priced metal");
  assert.equal(runPitShell({ ...base, cells, alsoCells: [{ label: "x", cells: at(1) }], alsoPrices: [{ ...ag, unit: "index" }] }).failed, "also-units");
});

test("#3312 a typed cut-off decides the ore, with or without a by-product, as the shell does", () => {
  const e = pitEconomics({ ...base, by, typedCutoff: 2000 });
  const rich = { value: 2500, by: 0 }, paying = { value: 1500, by: 2 }; // 1500 ppm pays with its gold, but is under the typed 2000
  assert.equal(cellIsOre(rich, e, 10), true);
  assert.equal(cellIsOre(paying, e, 10), false);
  assert.ok(cellRevenue(paying, e) > 10, "it would pay on revenue: the old design rule called it ore");
  assert.equal(cellIsOre(paying, pitEconomics({ ...base, by }), 10), true, "no typed cut-off: revenue decides");
  for (const c of [rich, paying]) assert.equal(cellIsOre(c, e, 10), cellMargin(c, e, 2.5, 10) > -2.5, "the same decision as the shell's margin");
  const w = readFileSync(new URL("../src/lib/pitDesign.worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(w, /if \(eco && \(\(b && eco\.by\) \|\| eco\.alsoPriced\)\) cells = cells\.map\(\(cell\) => \(\{ \.\.\.cell, ore: cellIsOre\(cell, eco, opts\.economics\.processingCost\) \}\)\);/);
  assert.ok(!/cellRevenue\(cell, eco\) > opts\.economics\.processingCost/.test(w));
});
